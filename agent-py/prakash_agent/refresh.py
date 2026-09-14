"""Re-reading the page a listing came from, to see what it costs today.

Distinct from `repricer.py`, which searches the open web afresh for what the trade
is charging and costs a search plus a model call per watch. This asks a narrower
question — *what does the page we already used say now?* — and answers it for
nothing, because almost every source is a Shopify product page and appending
`.json` to it returns the live price, the struck-through figure and whether the
shop still has it. Measured over the shop's own catalogue: 1,716 of 1,899
listings carry such a URL, and every one sampled answered.

What it may change, and what it may not:

* **MRP is the brand's number.** When a shop revises the list price, a displayed
  "28% off" quietly becomes a lie. Refreshing it is a factual correction, so it
  is applied.
* **A price the shop typed is the shop's own.** It encodes margin, ageing stock
  and what the dealer paid. Nothing found on a website may touch it.
* **A price the agent looked up is not the shop's.** 1,694 listings carry
  `estimated-price` precisely because the sheet gave none and the figure came off
  a website. Refreshing those from the same website is the whole point — they
  were never anybody's decision, and leaving them stale is the real error.

Every reading is recorded whether it changed anything or not, so the shop can see
when a watch was last checked and what the source said.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .artifact import artifact_path, rebuild_index, write_artifact
from .config import AgentConfig, load_config
from .events import EventBus
from .http_client import HttpClient
from .cache import Cache
from .models import WatchProduct
from .util import now_iso, read_json, write_json

#: A quote outside this is a strap, an EMI instalment or a currency mix-up.
MIN_PRICE = 300.0
MAX_PRICE = 5_000_000.0

#: Where the readings are kept, one line per watch per run.
LEDGER = "price-history.jsonl"


@dataclass
class Reading:
    """What one source page said this time."""

    sku: str
    title: str
    url: str = ""
    #: What the source is charging today.
    price: float | None = None
    #: The source's struck-through figure — the list price it claims.
    list_price: float | None = None
    in_stock: bool | None = None
    #: What changed on our listing as a result.
    changes: list[str] = field(default_factory=list)
    status: str = "unchanged"
    note: str = ""

    @property
    def discount_pct(self) -> int | None:
        if self.list_price and self.price and self.list_price > self.price:
            return round((self.list_price - self.price) / self.list_price * 100)
        return None

    def dump(self) -> dict[str, Any]:
        return {
            "sku": self.sku,
            "title": self.title,
            "url": self.url,
            "price": self.price,
            "listPrice": self.list_price,
            "discountPct": self.discount_pct,
            "inStock": self.in_stock,
            "changes": self.changes,
            "status": self.status,
            "note": self.note,
            "checkedAt": now_iso(),
        }


def _money(value: Any) -> float | None:
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return None
    return amount if MIN_PRICE <= amount <= MAX_PRICE else None


def source_url(product: WatchProduct) -> str:
    """The page this listing is reachable at.

    The first source is the one the listing was built from — a storefront hit when
    there was one, which is the case for nine listings in ten.
    """
    for source in product.sources:
        if "/products/" in source.url or source.kind in ("official", "retailer"):
            return source.url
    return product.sources[0].url if product.sources else ""


async def read_source(url: str, http: HttpClient) -> Reading | None:
    """What the source page says now, or None when it cannot be read.

    Shopify answers `<product url>.json` with the live variant. That is one cached
    request, no model call, and an exact figure rather than a parsed guess — which
    is why this is affordable to run across the whole catalogue.
    """
    if "/products/" not in url:
        return None

    payload = await http.get_json(url.split("?")[0].rstrip("/") + ".json")
    if not isinstance(payload, dict):
        return None
    product = payload.get("product")
    if not isinstance(product, dict):
        return None

    variants = product.get("variants") or []
    if not variants:
        return None
    first = variants[0]

    reading = Reading(sku="", title=product.get("title") or "", url=url)
    reading.price = _money(first.get("price"))
    reading.list_price = _money(first.get("compare_at_price"))
    available = first.get("available")
    reading.in_stock = bool(available) if isinstance(available, bool) else None
    return reading


def apply(product: WatchProduct, reading: Reading) -> list[str]:
    """Writes what the source says onto the listing, within the rules above."""
    changes: list[str] = []
    flags = list(product.review.flags)

    # The brand's list price, and therefore the discount we display.
    if reading.list_price and reading.list_price != product.price.mrp:
        # An MRP at or below what we sell for is not a list price; showing it
        # would produce a negative discount.
        if product.price.selling is None or reading.list_price > product.price.selling:
            before = product.price.mrp
            product.price.mrp = reading.list_price
            changes.append(
                f"MRP {'₹{:,.0f}'.format(before) if before else '—'} → ₹{reading.list_price:,.0f}"
            )

    # A looked-up price may be refreshed from the same place it was looked up, and
    # a listing with no price at all may be given one — the shop would rather show
    # a figure from the trade, marked as such, than "price on request". A price the
    # shop typed is neither of those: it is a commercial decision, not a fact, and
    # nothing here may touch it.
    fillable = "estimated-price" in flags or product.price.selling is None
    if fillable and reading.price and reading.price != product.price.selling:
        before = product.price.selling
        product.price.selling = reading.price
        changes.append(
            f"price {'₹{:,.0f}'.format(before) if before else 'not set'} → ₹{reading.price:,.0f}"
            + (" (was an estimate)" if before else " (from the source)")
        )
        # It came off a website, so it must say so — and it is no longer absent.
        if "estimated-price" not in flags:
            flags.append("estimated-price")
        flags = [f for f in flags if f != "no-price"]
        product.review.flags = flags  # type: ignore[assignment]

    # Recompute the displayed saving from whatever now stands.
    mrp, selling = product.price.mrp, product.price.selling
    was_pct = product.price.discount_pct
    product.price.discount_pct = (
        round((mrp - selling) / mrp * 100) if mrp and selling and mrp > selling else None
    )
    if product.price.discount_pct != was_pct and not any(c.startswith("MRP") for c in changes):
        changes.append(f"discount {was_pct or 0}% → {product.price.discount_pct or 0}%")

    if changes:
        product.meta.updated_at = now_iso()
    return changes


async def run_refresh(
    *,
    config: AgentConfig | None = None,
    on_event=None,
    skus: list[str] | None = None,
    dry_run: bool = False,
    listed_only: bool = True,
) -> dict[str, Any]:
    """Walks the catalogue, re-reads each listing's own source page, and applies it.

    `listed_only` — the default — touches only watches actually on the shop. A
    listing still held for review is not published, so refreshing its price moves
    figures nobody has approved on a page nobody can see, and buries the real
    changes among them. When such a watch is approved it is researched afresh
    anyway, which sets its price from the same source this would have used.

    `dry_run` reports every change without writing one, so the shop can see what a
    refresh would do to its prices before it does it.
    """
    cfg = config or load_config()
    bus = EventBus()
    if on_event:
        bus.on(on_event)

    data_dir = Path(cfg.data_dir)
    files = sorted(f for f in data_dir.glob("*.json") if f.name != "index.json")
    if skus:
        wanted = set(skus)
        files = [f for f in files if f.stem in wanted]

    cache = Cache(Path(cfg.cache_dir), cfg.cache)
    http = HttpClient(cfg, cache)

    readings: list[Reading] = []
    counts = {"checked": 0, "changed": 0, "unreachable": 0, "no-url": 0, "not-listed": 0}
    bus.emit({"type": "refresh:start", "total": len(files), "dryRun": dry_run,
              "listedOnly": listed_only})

    semaphore = asyncio.Semaphore(max(1, cfg.concurrency * 2))

    async def one(path: Path) -> None:
        raw = read_json(path)
        if not isinstance(raw, dict):
            return
        try:
            product = WatchProduct.model_validate(raw)
        except Exception:  # noqa: BLE001 - a corrupt artifact is left alone
            return

        # Not on the shop, so its price is not on the shop either.
        if listed_only and product.status != "ready":
            counts["not-listed"] += 1
            return

        url = source_url(product)
        if not url:
            counts["no-url"] += 1
            bus.emit({"type": "refresh:row", "sku": product.sku, "title": product.title,
                      "status": "no-url", "changes": []})
            return

        async with semaphore:
            try:
                reading = await read_source(url, http)
            except Exception as error:  # noqa: BLE001
                reading = None
                note = str(error)[:120]
            else:
                note = ""

        counts["checked"] += 1
        if reading is None:
            counts["unreachable"] += 1
            bus.emit({"type": "refresh:row", "sku": product.sku, "title": product.title,
                      "status": "unreachable", "changes": [], "url": url})
            readings.append(Reading(sku=product.sku, title=product.title, url=url,
                                    status="unreachable", note=note))
            return

        reading.sku, reading.title = product.sku, product.title
        changes = apply(product, reading)
        reading.changes = changes
        reading.status = "changed" if changes else "unchanged"
        if changes:
            counts["changed"] += 1
            if not dry_run:
                write_artifact(product, cfg)
        readings.append(reading)
        bus.emit({
            "type": "refresh:row",
            "sku": product.sku,
            "title": product.title,
            "status": reading.status,
            "changes": changes,
            "price": reading.price,
            "listPrice": reading.list_price,
            "discountPct": reading.discount_pct,
            "url": url,
        })

    await asyncio.gather(*(one(f) for f in files))
    await http.aclose()

    # Every reading is kept, changed or not, so "when was this last checked?" has
    # an answer even for the watches nothing moved on.
    if not dry_run and readings:
        ledger = data_dir.parent / LEDGER
        with ledger.open("a", encoding="utf-8") as handle:
            for reading in readings:
                handle.write(json.dumps(reading.dump(), ensure_ascii=False) + "\n")
        rebuild_index(cfg)

    summary = {
        "total": len(files),
        **counts,
        "dryRun": dry_run,
        "finishedAt": now_iso(),
        "changed_rows": [r.dump() for r in readings if r.changes],
    }
    bus.emit({"type": "refresh:done", **{k: v for k, v in summary.items() if k != "changed_rows"}})
    return summary
