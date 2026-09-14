"""What a run will cost, and what it will find, before any of it is paid for.

A sheet of two thousand references is not two thousand equal jobs. A row whose
reference sits in a shop's published catalogue is answered by one cached request
and comes back right almost every time; a row no feed carries falls through to
open web search, costs more than twice as much, and comes back wrong far more
often. Measured over the shop's own sheet: the catalogue path returned 924 ready
listings out of 936 with zero failures, while the search path on Titan returned
16 ready out of 261.

So the useful question before spending is not "how many rows" but "how many of
them can be looked up". This module answers that without calling a model at all
— it reads the same feeds the run would read, and asks the same matcher. The
run that follows can then take the answerable rows first, which is what makes a
small balance buy every good listing rather than a random half of them.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from . import storefront as sf
from .artifact import artifact_path
from .cache import Cache
from .config import AgentConfig
from .http_client import HttpClient
from .models import SheetRow
from .registry import BrandRegistry
from .util import make_sku

#: What a row costs to research, by the path it will take. Both measured across
#: the shop's own 2,186-row sheet rather than estimated: 936 rows answered from
#: catalogues cost $6.18, and the search path on Titan cost $3.48 over 261 rows.
COST_FROM_CATALOGUE = 0.0066
COST_FROM_SEARCH = 0.0133


@dataclass(frozen=True)
class RowPlan:
    """One sheet row, and how the run would go about it."""

    row: SheetRow
    sku: str
    #: Already on disk — the run would skip it unless forced.
    catalogued: bool
    #: A shop's published catalogue carries this reference.
    covered: bool
    #: Which shop answered, for the report.
    host: str = ""

    @property
    def cost(self) -> float:
        if self.catalogued:
            return 0.0
        return COST_FROM_CATALOGUE if self.covered else COST_FROM_SEARCH


@dataclass
class BrandPlan:
    """The same, totalled for one brand — how the shop reads it."""

    brand: str
    rows: int = 0
    catalogued: int = 0
    covered: int = 0
    uncovered: int = 0
    hosts: dict[str, int] | None = None

    def as_dict(self) -> dict[str, Any]:
        top = sorted((self.hosts or {}).items(), key=lambda kv: -kv[1])[:3]
        return {
            "brand": self.brand,
            "rows": self.rows,
            "catalogued": self.catalogued,
            "covered": self.covered,
            "uncovered": self.uncovered,
            "answeredBy": [{"host": h, "rows": n} for h, n in top],
        }


async def plan_rows(
    rows: Iterable[SheetRow],
    cfg: AgentConfig,
    *,
    force: bool = False,
    on_progress=None,
) -> list[RowPlan]:
    """Work out, for every row, whether a catalogue can answer it.

    Costs nothing but requests, and those are cached for a day, so asking twice
    in one sitting is free. `force` mirrors the run's own flag: with it set,
    rows already on disk are planned as work rather than as skips.
    """
    cache = Cache(Path(cfg.cache_dir), cfg.cache)
    http = HttpClient(cfg, cache)
    registry = BrandRegistry(Path(cfg.brands_path))

    catalogues: dict[str, list[sf.StoreProduct]] = {}

    async def catalogue(host: str) -> list[sf.StoreProduct]:
        if host not in catalogues:
            try:
                catalogues[host] = await sf.load_catalogue(host, http, cache) or []
            except Exception:  # noqa: BLE001 - an unreadable shop simply answers nothing
                catalogues[host] = []
        return catalogues[host]

    for host in sf.RETAILER_FEEDS:
        await catalogue(host)

    plans: list[RowPlan] = []
    for index, row in enumerate(rows):
        sku = make_sku(row.brand, row.model_number)
        catalogued = (not force) and artifact_path(cfg, sku).exists()

        covered, answered = False, ""
        if not catalogued:
            record = registry.get(row.brand)
            brand_hosts = record.hosts() if record else []
            for host in brand_hosts:
                await catalogue(host)
            for host in sf.walk_order(row.brand, brand_hosts):
                if catalogues.get(host) and sf.match(catalogues[host], row.model_number, row.brand):
                    covered, answered = True, host
                    break

        plans.append(RowPlan(row=row, sku=sku, catalogued=catalogued, covered=covered, host=answered))
        if on_progress and index % 50 == 0:
            on_progress(index + 1)
        # Yield to the event loop so a streaming caller is not starved.
        if index % 50 == 0:
            await asyncio.sleep(0)

    return plans


def summarise(plans: list[RowPlan]) -> dict[str, Any]:
    """The report the shop actually reads: per brand, and what it will cost."""
    brands: dict[str, BrandPlan] = {}
    for plan in plans:
        entry = brands.setdefault(plan.row.brand, BrandPlan(brand=plan.row.brand, hosts={}))
        entry.rows += 1
        if plan.catalogued:
            entry.catalogued += 1
        elif plan.covered:
            entry.covered += 1
            entry.hosts[plan.host] = entry.hosts.get(plan.host, 0) + 1  # type: ignore[union-attr]
        else:
            entry.uncovered += 1

    todo = [p for p in plans if not p.catalogued]
    covered = [p for p in todo if p.covered]
    return {
        "rows": len(plans),
        "catalogued": sum(1 for p in plans if p.catalogued),
        "toResearch": len(todo),
        "covered": len(covered),
        "uncovered": len(todo) - len(covered),
        "estimatedCostUsd": round(sum(p.cost for p in todo), 2),
        "estimatedCostCoveredUsd": round(sum(p.cost for p in covered), 2),
        "brands": [
            b.as_dict()
            for b in sorted(brands.values(), key=lambda b: -(b.rows - b.catalogued))
        ],
    }


def order_covered_first(plans: list[RowPlan]) -> list[SheetRow]:
    """The same rows, catalogue-answerable ones first.

    When the balance runs out mid-run — which is how the last full run ended —
    what has already been bought should be the listings that come out right.
    Within each group the sheet's own order is kept, so a half-finished run still
    reads as the shop wrote it.

    Every row is returned. Reordering must never decide which rows run: dropping
    the already-listed ones here would silently discard the sheet updates that a
    run is often entirely made of, and the row itself already knows how to skip
    cheaply. Ordering is a preference, not a filter.
    """
    covered = [p.row for p in plans if not p.catalogued and p.covered]
    searchable = [p.row for p in plans if not p.catalogued and not p.covered]
    # Listed rows cost nothing to pass over, and in an update run they are the
    # entire point, so they go last rather than away.
    listed = [p.row for p in plans if p.catalogued]
    return covered + searchable + listed
