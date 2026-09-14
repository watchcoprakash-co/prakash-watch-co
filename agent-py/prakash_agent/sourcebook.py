"""The source book: where every model was ever found.

An artifact already cites its sources, but an artifact is a current view. Delete a
listing, re-run a row, or sell a reference through and the record of where its
details came from goes with it. That record is worth keeping on its own:

* When the same reference comes round again — a repeat order, a returned piece,
  the same model under a different sheet — the pages that answered last time are
  the obvious place to start, and can be read directly instead of searched for.
* When a customer disputes a specification, the shop needs to show which page it
  came from and when it was read, not merely that a machine believed it.
* Over a catalogue of a few thousand references it becomes a map of which
  publishers are actually worth reading for which brands.

Append-only JSONL, one line per watch per run. Appending is O(1) and safe to do
two thousand times in a run; rewriting a growing JSON array would not be. Nothing
is ever edited or removed, so the file is a history rather than a snapshot, and
the reader collapses it to a current view.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import AgentConfig
from .models import WatchProduct
from .util import now_iso


def path_for(config: AgentConfig) -> Path:
    """Beside the catalogue, so a backup of one takes the other."""
    return Path(config.data_dir).parent / "model-sources.jsonl"


def record(product: WatchProduct, config: AgentConfig) -> None:
    """Writes one line describing where this watch's details came from.

    Failures are swallowed: the source book is a record of work, and losing a line
    of it must never cost the shop the listing that work produced.
    """
    try:
        # How much each page actually contributed, rather than merely that it was
        # read — a page that gave nothing is worth knowing about too.
        specs_by_source: dict[int, int] = {}
        for spec in product.specs:
            if spec.source_index is not None:
                specs_by_source[spec.source_index] = specs_by_source.get(spec.source_index, 0) + 1

        images_by_page: dict[str, int] = {}
        for image in product.images:
            if image.source_page:
                images_by_page[image.source_page] = images_by_page.get(image.source_page, 0) + 1

        line = {
            "sku": product.sku,
            "brand": product.brand,
            "modelNumber": product.model_number,
            "title": product.title,
            "runId": product.meta.run_id,
            "at": now_iso(),
            "status": product.status,
            "matchConfidence": product.confidence.identity,
            "sources": [
                {
                    "url": source.url,
                    "publisher": source.publisher,
                    "kind": source.kind,
                    "title": source.title,
                    "fetchedAt": source.fetched_at,
                    "gaveSpecs": specs_by_source.get(source.index, 0),
                    "gaveImages": images_by_page.get(source.url, 0),
                }
                for source in product.sources
            ],
            # Image hosts are recorded separately: a photograph is often served
            # from a CDN that is not the page it was found on.
            "imageSources": sorted({image.source_url for image in product.images if image.source_url}),
        }

        target = path_for(config)
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(line, ensure_ascii=False) + "\n")
    except Exception:  # noqa: BLE001 - never let bookkeeping break an ingestion
        pass


def read_all(config: AgentConfig) -> list[dict[str, Any]]:
    """Every line, oldest first. A corrupt line is skipped, not fatal."""
    target = path_for(config)
    out: list[dict[str, Any]] = []
    try:
        with target.open("r", encoding="utf-8") as handle:
            for raw in handle:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    out.append(json.loads(raw))
                except json.JSONDecodeError:
                    continue
    except OSError:
        return []
    return out


def known_urls(config: AgentConfig, brand: str, model_number: str) -> list[str]:
    """Pages that answered for this reference before, most recent first.

    Lets a re-run go straight to what worked rather than searching again.
    """
    wanted = (brand.strip().lower(), model_number.strip().lower())
    urls: list[str] = []
    for line in reversed(read_all(config)):
        if (str(line.get("brand", "")).lower(), str(line.get("modelNumber", "")).lower()) != wanted:
            continue
        for source in line.get("sources", []):
            url = source.get("url")
            if url and url not in urls:
                urls.append(url)
    return urls
