"""HTTP service the admin panel talks to.

The Next.js upload route proxies to this, so the browser gets the same live
progress events the CLI prints. Run it with:

    uvicorn prakash_agent.server:app --port 8077
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
import time
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .config import load_config
from .models import SheetRow
from .graph import run_ingestion, run_rows, run_single
from .refresh import run_refresh
from .repricer import run_price_watch

app = FastAPI(title="Prakash Watch Co. Catalog Agent", version="1.0.0")

# Only matters if this service is ever reached straight from a browser — the
# admin panel normally proxies through Next.js server-side, which browser
# CORS does not apply to. The real access control is AGENT_SERVICE_TOKEN
# below, not this.
_allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "AGENT_ALLOWED_ORIGINS", "https://prakashwatchco.in,https://www.prakashwatchco.in"
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "x-agent-token"],
)

ALLOWED_SUFFIXES = (".xlsx", ".csv")
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
_UNSAFE = re.compile(r"[^a-zA-Z0-9._-]")


def _check_token(provided: str | None) -> None:
    """Shared-secret guard so only the site's server can spend the shop's credit."""
    expected = os.getenv("AGENT_SERVICE_TOKEN")
    if not expected:
        return  # No token configured — local development.
    if not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Bad service token.")


@app.get("/health")
async def health() -> dict[str, Any]:
    config = load_config()
    return {
        "ok": True,
        "hasApiKey": bool(config.api_key),
        "model": config.model,
        "visionModel": config.vision_model,
        "searchModel": config.search_model,
        "dataDir": str(config.data_dir),
    }


@app.post("/preflight")
async def preflight(
    file: UploadFile = File(...),
    force: bool = Form(False),
    x_agent_token: str | None = Header(default=None),
) -> dict[str, Any]:
    """What this sheet would cost, and how much of it can be looked up.

    Spends nothing. It reads the same published catalogues the run would read —
    cached for a day, so asking before every run is free after the first — and
    reports how many rows a shop can answer outright against how many would have
    to be searched for. The shop can then decide whether the balance covers it
    before committing, instead of finding out two thirds of the way through.
    """
    _check_token(x_agent_token)

    name = (file.filename or "sheet.xlsx").lower()
    if not name.endswith(ALLOWED_SUFFIXES):
        raise HTTPException(status_code=400, detail="Upload an .xlsx or .csv file.")

    payload = await file.read()
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="That file is larger than 8 MB.")

    from .preflight import plan_rows, summarise
    from .sheet import parse_sheet

    config = load_config(force=force)
    upload_dir = Path(config.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    saved = upload_dir / f"{int(time.time())}-preflight-{_UNSAFE.sub('_', file.filename or 'sheet.xlsx')}"
    saved.write_bytes(payload)

    parsed = parse_sheet(saved)
    # `force` means the run will redo listed rows, so they are not free skips.
    plans = await plan_rows(parsed.rows, config, force=force)
    report = summarise(plans)
    report["rejected"] = len(parsed.errors)
    report["balanceUsd"] = await _balance()
    return report


async def _balance() -> float | None:
    """What is left on the account, or None when it cannot be read.

    The run that catalogued the shop's sheet stopped two thirds of the way
    through because this number reached zero, and nothing in the panel showed it.
    """
    key = os.getenv("OPENROUTER_API_KEY")
    if not key:
        return None
    try:
        import httpx

        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                "https://openrouter.ai/api/v1/credits",
                headers={"Authorization": f"Bearer {key}"},
            )
        data = response.json().get("data") or {}
        return round(float(data["total_credits"]) - float(data["total_usage"]), 2)
    except Exception:  # noqa: BLE001 - a balance we cannot read is simply not shown
        return None


@app.get("/balance")
async def balance(x_agent_token: str | None = Header(default=None)) -> dict[str, Any]:
    """What is left to spend."""
    _check_token(x_agent_token)
    return {"balanceUsd": await _balance()}


class RefreshRequest(BaseModel):
    """Re-read every listing's own source page and apply what it says."""

    skus: list[str] | None = None
    dry_run: bool = False
    #: Only watches actually on the shop. Ones held for review are re-researched
    #: when they are approved, which prices them from the same source anyway.
    listed_only: bool = True


@app.post("/refresh")
async def refresh(
    request: RefreshRequest,
    x_agent_token: str | None = Header(default=None),
) -> StreamingResponse:
    """Checks today's price and discount at the page each listing came from.

    Streams a line per watch. Costs nothing but requests: the sources are Shopify
    product pages, which answer with the live variant directly.
    """
    _check_token(x_agent_token)
    config = load_config()

    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

    def on_event(event: dict[str, Any]) -> None:
        queue.put_nowait(event)

    async def run() -> None:
        try:
            summary = await run_refresh(
                config=config,
                on_event=on_event,
                skus=request.skus,
                dry_run=request.dry_run,
                listed_only=request.listed_only,
            )
            await queue.put({"type": "report", "report": summary})
        except Exception as error:  # noqa: BLE001 - surfaced to the browser
            await queue.put({"type": "error", "message": str(error) or error.__class__.__name__})
        finally:
            await queue.put(None)

    task = asyncio.create_task(run())

    async def stream() -> AsyncIterator[bytes]:
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield f"data: {json.dumps(event)}\n\n".encode()
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"cache-control": "no-cache, no-transform", "x-accel-buffering": "no"},
    )


@app.post("/ingest")
async def ingest(
    file: UploadFile = File(...),
    dry_run: bool = Form(False),
    force: bool = Form(False),
    limit: int | None = Form(None),
    only: str | None = Form(None),
    covered_first: bool = Form(False),
    mode: str = Form("both"),
    x_agent_token: str | None = Header(default=None),
) -> StreamingResponse:
    """Accepts a stock sheet and streams progress back as server-sent events."""
    _check_token(x_agent_token)

    name = (file.filename or "sheet.xlsx").lower()
    if not name.endswith(ALLOWED_SUFFIXES):
        raise HTTPException(
            status_code=400,
            detail="Upload an .xlsx or .csv file. Legacy .xls is not supported — re-save it as .xlsx.",
        )

    payload = await file.read()
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="That file is larger than 8 MB.")

    config = load_config(dry_run=dry_run, force=force)

    # Keep the uploaded sheet so a run can be traced back to its source file.
    upload_dir = Path(config.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    saved = upload_dir / f"{int(time.time())}-{_UNSAFE.sub('_', file.filename or 'sheet.xlsx')}"
    saved.write_bytes(payload)

    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

    def on_event(event: dict[str, Any]) -> None:
        queue.put_nowait(event)

    async def run() -> None:
        try:
            report = await run_ingestion(
                saved,
                config=config,
                on_event=on_event,
                limit=limit,
                only=[part.strip() for part in only.split(",") if part.strip()] if only else None,
                covered_first=covered_first,
                mode=mode,
            )
            await queue.put({"type": "report", "report": report.dump()})
        except Exception as error:  # noqa: BLE001 - surfaced to the browser
            await queue.put({"type": "error", "message": str(error) or error.__class__.__name__})
        finally:
            await queue.put(None)

    task = asyncio.create_task(run())

    async def stream() -> AsyncIterator[bytes]:
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield f"data: {json.dumps(event)}\n\n".encode()
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "cache-control": "no-cache, no-transform",
            # Stops proxies buffering the stream into one lump.
            "x-accel-buffering": "no",
        },
    )


@app.post("/ingest-one")
async def ingest_one(
    brand: str = Form(...),
    model_number: str = Form(...),
    price: float | None = Form(None),
    mrp: float | None = Form(None),
    cost_price: float | None = Form(None),
    quantity: int | None = Form(None),
    model_name: str | None = Form(None),
    gender: str | None = Form(None),
    collection_hint: str | None = Form(None),
    force: bool = Form(False),
    dry_run: bool = Form(False),
    x_agent_token: str | None = Header(default=None),
) -> StreamingResponse:
    """Researches one watch from a reference typed at the counter.

    The same graph as a sheet run, given a single hand-built row. The shop still
    supplies price and quantity — those are commercial facts, and nothing found
    on the web is allowed to set them.
    """
    _check_token(x_agent_token)

    brand = brand.strip()
    model_number = model_number.strip()
    if not brand or not model_number:
        raise HTTPException(status_code=400, detail="A brand and a model number are both needed.")
    if price is not None and price <= 0:
        raise HTTPException(status_code=400, detail="A price must be a positive figure, or left out entirely.")

    row = SheetRow(
        row_number=1,
        sheet="typed in",
        brand=brand,
        model_number=model_number,
        price=price,
        mrp=mrp,
        cost_price=cost_price,
        quantity=quantity,
        model_name=(model_name or "").strip() or None,
        gender=(gender or "").strip() or None,
        collection_hint=(collection_hint or "").strip() or None,
    )

    config = load_config(dry_run=dry_run, force=force)
    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

    def on_event(event: dict[str, Any]) -> None:
        queue.put_nowait(event)

    async def run() -> None:
        try:
            report = await run_single(row, config=config, on_event=on_event)
            await queue.put({"type": "report", "report": report.dump()})
        except Exception as error:  # noqa: BLE001 - surfaced to the browser
            await queue.put({"type": "error", "message": str(error) or error.__class__.__name__})
        finally:
            await queue.put(None)

    task = asyncio.create_task(run())

    async def stream() -> AsyncIterator[bytes]:
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield f"data: {json.dumps(event)}\n\n".encode()
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"cache-control": "no-cache, no-transform", "x-accel-buffering": "no"},
    )


@app.post("/reprice")
async def reprice(
    only: str | None = Form(None),
    limit: int | None = Form(None),
    max_pages: int = Form(6),
    x_agent_token: str | None = Header(default=None),
) -> StreamingResponse:
    """Sweeps the listed catalogue for price movement and streams progress.

    Writes findings for review and changes nothing: the shop's selling prices are
    its own, and even an MRP correction is applied by a person from the stock room.
    """
    _check_token(x_agent_token)

    config = load_config()
    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

    def on_event(event: dict[str, Any]) -> None:
        queue.put_nowait(event)

    async def run() -> None:
        try:
            report = await run_price_watch(
                config=config,
                on_event=on_event,
                only=[part.strip() for part in only.split(",") if part.strip()] if only else None,
                limit=limit,
                max_pages=max(1, min(max_pages, 10)),
            )
            await queue.put({"type": "report", "report": report.dump()})
        except Exception as error:  # noqa: BLE001 - surfaced to the browser
            await queue.put({"type": "error", "message": str(error) or error.__class__.__name__})
        finally:
            await queue.put(None)

    task = asyncio.create_task(run())

    async def stream() -> AsyncIterator[bytes]:
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield f"data: {json.dumps(event)}\n\n".encode()
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"cache-control": "no-cache, no-transform", "x-accel-buffering": "no"},
    )


class RerunWatch(BaseModel):
    """One watch to put back through the graph."""

    brand: str
    model_number: str
    #: The manufacturer's reference, when the shop has since supplied one the
    #: agent could not resolve. Overrides whatever the last run worked out.
    reference: str | None = None
    price: float | None = None
    mrp: float | None = None
    cost_price: float | None = None
    quantity: int | None = None
    model_name: str | None = None


class RerunRequest(BaseModel):
    watches: list[RerunWatch]


@app.post("/rerun")
async def rerun(
    body: RerunRequest,
    x_agent_token: str | None = Header(default=None),
) -> StreamingResponse:
    """Researches a named set of watches again, from scratch.

    Always forced: a rerun is asked for precisely because what is on file is
    wrong, so skipping rows that already exist would do nothing at all. Used for
    one listing under review and for the whole review queue alike — the only
    difference is how many watches arrive in the list.
    """
    _check_token(x_agent_token)

    if not body.watches:
        raise HTTPException(status_code=400, detail="No watches were given to re-run.")
    if len(body.watches) > 500:
        raise HTTPException(status_code=400, detail="Re-run at most 500 watches at a time.")

    rows = [
        SheetRow(
            row_number=index + 1,
            sheet="re-run",
            brand=watch.brand.strip(),
            model_number=watch.model_number.strip(),
            reference=(watch.reference or "").strip() or None,
            price=watch.price,
            mrp=watch.mrp,
            cost_price=watch.cost_price,
            quantity=watch.quantity,
            model_name=(watch.model_name or "").strip() or None,
        )
        for index, watch in enumerate(body.watches)
        if watch.brand.strip() and watch.model_number.strip()
    ]
    if not rows:
        raise HTTPException(status_code=400, detail="Every watch needs a brand and a model number.")

    config = load_config(force=True)
    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

    def on_event(event: dict[str, Any]) -> None:
        queue.put_nowait(event)

    async def run() -> None:
        try:
            report = await run_rows(rows, source_file=f"re-run of {len(rows)} watch(es)",
                                    config=config, on_event=on_event)
            await queue.put({"type": "report", "report": report.dump()})
        except Exception as error:  # noqa: BLE001 - surfaced to the browser
            await queue.put({"type": "error", "message": str(error) or error.__class__.__name__})
        finally:
            await queue.put(None)

    task = asyncio.create_task(run())

    async def stream() -> AsyncIterator[bytes]:
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield f"data: {json.dumps(event)}\n\n".encode()
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"cache-control": "no-cache, no-transform", "x-accel-buffering": "no"},
    )
