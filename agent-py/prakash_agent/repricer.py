"""The price watch.

Walks the published catalogue and asks, for each reference, what the brand and
the trade are charging for it today — then reports back.

What it will and will not change is the whole design of this module. **MRP is the
brand's number**: when Seiko revises the list price of a Presage, the shop's
displayed "28% off" quietly becomes a lie, and refreshing that is a factual
correction. **The selling price is the shop's number**: it encodes margin, ageing
stock, what the dealer paid and what the customer in front of them will bear.
Nothing found on the internet gets to touch it. So this agent proposes an MRP and
reports the market; a person decides everything else.

Findings are written to a file the stock room reads, not applied on the spot —
a run that quietly repriced two hundred watches would be impossible to review.
"""

from __future__ import annotations

import asyncio
import re
import statistics
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import Field

from .config import AgentConfig, load_config
from .events import EventBus
from .http_client import HttpClient
from .models import Model, WatchProduct
from .openrouter import OpenRouterClient
from .cache import Cache
from .research import scrape_page
from .registry import BrandRegistry
from .util import now_iso, read_json, write_json

#: Below this the quote is almost certainly an accessory, a strap or an EMI figure.
MIN_PLAUSIBLE = 500.0
#: Above this it is a different watch, or a price in another currency read as rupees.
MAX_PLAUSIBLE = 5_000_000.0
#: MRP within this of the stored one is treated as unchanged — sites round oddly.
TOLERANCE = 0.02
#: An MRP must clear the selling price by this much to be worth showing; a struck
#: -through figure a rupee above the real one just looks like a mistake.
MIN_DISCOUNT = 0.03

#: A quote is only believed if it sits in this band around the shop's own price.
#: A real competitor undercuts by ten or twenty per cent; a figure at a sixth of
#: the price is a strap, a battery or another watch further down the same page —
#: measured, an Edifice the shop sells at ₹10,076 was "found" at ₹1,699.
MIN_RATIO = 0.4
MAX_RATIO = 3.0

#: Neighbouring countries whose sites quote their own rupee, not India's. Reading
#: 61,300 Nepali rupees as ₹61,300 would put the whole market figure out by 40%.
FOREIGN_HINTS = (".np", ".lk", ".bd", ".pk", "nepal", "srilanka", "lanka", "bangladesh", "pakistan")


class PriceQuote(Model):
    """One price seen on one page."""

    price: float
    url: str
    publisher: str = ""
    kind: str = "other"
    #: True when the page presents this as the list price rather than its own.
    is_list_price: bool = False


class PriceFinding(Model):
    """What the sweep concluded about one reference."""

    sku: str
    brand: str
    model_number: str
    title: str
    #: What the shop charges and shows as struck through, today.
    shop_selling: float
    shop_mrp: float | None = None
    quotes: list[PriceQuote] = Field(default_factory=list)
    #: List price according to the brand's own site, when it could be read.
    official_mrp: float | None = None
    market_low: float | None = None
    market_median: float | None = None
    #: What the agent would set MRP to. Never applied automatically.
    suggested_mrp: float | None = None
    verdict: str = "no-data"
    note: str = ""
    checked_at: str = ""
    cost_usd: float = 0.0


class PriceReport(Model):
    run_id: str
    started_at: str
    finished_at: str
    checked: int = 0
    with_data: int = 0
    proposals: int = 0
    cost_usd: float = 0.0
    findings: list[PriceFinding] = Field(default_factory=list)


QUOTE_SCHEMA = {
    "name": "prices_on_page",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["quotes"],
        "properties": {
            "quotes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["price", "isListPrice", "confidence"],
                    "properties": {
                        "price": {"type": "number", "description": "Amount in Indian rupees."},
                        "isListPrice": {
                            "type": "boolean",
                            "description": "True for MRP / RRP / 'was' price; false for the price actually charged.",
                        },
                        "confidence": {"type": "number", "description": "0 to 1 that this is a price for THIS watch."},
                    },
                },
            }
        },
    },
}


def _plausible(value: float | None, reference: float | None = None) -> bool:
    """Is this a believable price — in itself, and beside what the shop charges?"""
    if value is None or not (MIN_PLAUSIBLE <= value <= MAX_PLAUSIBLE):
        return False
    if reference and reference > 0:
        return MIN_RATIO * reference <= value <= MAX_RATIO * reference
    return True


def _publisher(url: str) -> str:
    match = re.match(r"https?://([^/]+)", url)
    return match.group(1).removeprefix("www.") if match else url


async def _read_prices(
    product: WatchProduct,
    pages: list[Any],
    llm: OpenRouterClient,
    official_hosts: list[str],
) -> tuple[list[PriceQuote], float]:
    """Turns scraped pages into quotes, structured data first and the model second.

    JSON-LD is free and exact where a shop publishes it, so it is taken as read.
    The model is asked only about pages that had none — which keeps a sweep of two
    hundred watches to a few rupees rather than a few hundred.
    """
    quotes: list[PriceQuote] = []
    needs_model: list[Any] = []

    for page in pages:
        host = _publisher(page.url)
        # A price in another country's rupee is not a price in ours.
        if any(hint in host for hint in FOREIGN_HINTS):
            continue
        kind = "official" if any(host.endswith(h) or h in page.url for h in official_hosts) else "retailer"
        if _plausible(page.listed_price, product.price.selling):
            quotes.append(
                PriceQuote(price=float(page.listed_price), url=page.url, publisher=host, kind=kind, is_list_price=False)
            )
        else:
            needs_model.append((page, kind, host))

    cost = 0.0
    for page, kind, host in needs_model[:4]:
        snippet = f"{page.title}\n{page.description}\n{page.text[:1800]}"
        if "₹" not in snippet and "rs" not in snippet.lower() and "inr" not in snippet.lower():
            continue  # no rupee figure on the page at all; nothing to read

        try:
            data, call_cost = await llm.chat_json(
                model=llm.search_model,
                max_tokens=400,
                schema=QUOTE_SCHEMA,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You read prices off a retail page. Report only prices for the watch named by the "
                            "user — never for accessories, straps, EMI instalments, delivery, or other products "
                            "listed alongside. If the page shows a struck-through price and a lower one, report "
                            "both: the struck-through one with isListPrice true. Return an empty list when the "
                            "page does not price this watch."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"Watch: {product.brand} {product.model_number} ({product.title})\n\nPage:\n{snippet}",
                    },
                ],
            )
            cost += call_cost
        except Exception:  # noqa: BLE001 - one unreadable page must not end the sweep
            continue

        for raw in data.get("quotes", []) or []:
            price = raw.get("price")
            if not _plausible(price, product.price.selling) or float(raw.get("confidence") or 0) < 0.6:
                continue
            quotes.append(
                PriceQuote(
                    price=float(price),
                    url=page.url,
                    publisher=host,
                    kind=kind,
                    is_list_price=bool(raw.get("isListPrice")),
                )
            )

    return quotes, cost


def judge(product: WatchProduct, quotes: list[PriceQuote]) -> PriceFinding:
    """Decides what, if anything, the shop should be told about this reference."""
    finding = PriceFinding(
        sku=product.sku,
        brand=product.brand,
        model_number=product.model_number,
        title=product.title,
        shop_selling=product.price.selling,
        shop_mrp=product.price.mrp,
        quotes=quotes,
        checked_at=now_iso(),
    )

    if not quotes:
        finding.verdict = "no-data"
        finding.note = "No page priced this reference. It may be discontinued, or listed only in stores."
        return finding

    selling_quotes = [q.price for q in quotes if not q.is_list_price]
    list_quotes = [q.price for q in quotes if q.is_list_price]
    official_list = [q.price for q in quotes if q.kind == "official" and q.is_list_price]
    official_any = [q.price for q in quotes if q.kind == "official"]

    if selling_quotes:
        finding.market_low = round(min(selling_quotes), 2)
        finding.market_median = round(statistics.median(selling_quotes), 2)

    # The brand's own list price is the best answer; a consensus of struck-through
    # prices elsewhere is the next best; nothing else is treated as an MRP.
    if official_list:
        finding.official_mrp = round(statistics.median(official_list), 2)
    elif official_any:
        finding.official_mrp = round(statistics.median(official_any), 2)

    candidate = finding.official_mrp
    if candidate is None and len(list_quotes) >= 2:
        candidate = round(statistics.median(list_quotes), 2)

    # An MRP below what the shop charges is not an MRP — it is somebody's sale price.
    if candidate is not None and candidate < product.price.selling:
        candidate = None

    # An MRP level with the selling price means the shop sells at list. That is worth
    # knowing and not worth proposing: the artifact stores an MRP only when it beats
    # the selling price, so applying it would change nothing and the sweep would
    # raise it again every week.
    if candidate is not None and candidate <= product.price.selling * (1 + MIN_DISCOUNT):
        finding.official_mrp = finding.official_mrp or candidate
        finding.verdict = "at-list"
        finding.note = (
            f"The brand lists it at ₹{candidate:,.0f} and the shop charges ₹{product.price.selling:,.0f} — "
            "selling at list, so there is no discount to show on the card."
        )
        return finding

    if candidate is not None:
        stored = product.price.mrp
        moved = stored is None or abs(candidate - stored) / max(stored, 1) > TOLERANCE
        if moved:
            finding.suggested_mrp = candidate
            finding.verdict = "mrp-moved"
            if stored is None:
                finding.note = (
                    f"No list price was stored. {_publisher(quotes[0].url)} and others put it at "
                    f"₹{candidate:,.0f}, which would show a discount on the card."
                )
            else:
                direction = "up" if candidate > stored else "down"
                finding.note = (
                    f"List price has moved {direction}, ₹{stored:,.0f} → ₹{candidate:,.0f}. "
                    f"The card currently claims a discount worked out from the old figure."
                )
            return finding

    # Nothing to change, but the market may still be worth mentioning.
    if finding.market_low is not None and finding.market_low < product.price.selling * 0.9:
        finding.verdict = "undercut"
        finding.note = (
            f"Others are asking as little as ₹{finding.market_low:,.0f} against your ₹{product.price.selling:,.0f}. "
            "Worth knowing before a customer quotes it at you — the price is yours to hold or move."
        )
        return finding

    if finding.market_low is not None and product.price.selling <= finding.market_low:
        finding.verdict = "keenest"
        finding.note = "Nobody found is cheaper than the shop on this reference."
        return finding

    finding.verdict = "unchanged"
    finding.note = "List price agrees with what is stored."
    return finding


async def _check_one(
    product: WatchProduct,
    *,
    http: HttpClient,
    llm: OpenRouterClient,
    registry: BrandRegistry,
    bus: EventBus,
    max_pages: int,
) -> PriceFinding:
    """Searches, reads and judges one reference."""
    # Deliberately padded, which is the opposite of what build_queries() does for
    # listing. The listing agent wants the right watch identified and measured that
    # bare queries win; this one wants Indian pages that actually quote a rupee
    # figure, and measured across three references: bare got 6 of 12 pages fetched
    # with 1 priced, "price in India" 8 and 3, this 9 and 6.
    query = f"{product.brand} {product.model_number} buy online India price ₹"
    cost = 0.0

    try:
        # Ten rather than six: most of the top results are the brand's own site or
        # a marketplace, and both refuse automated readers, so the pages that will
        # actually answer sit further down. Measured over four references, this
        # took priced pages from 6 to 9.
        search = await llm.search(query, 10)
        cost += float(search.get("costUsd") or 0.0)
        urls = [c["url"] for c in search.get("citations", [])][:max_pages]
    except Exception as error:  # noqa: BLE001
        finding = judge(product, [])
        finding.note = f"Could not search: {error}"
        return finding

    pages = []
    for url in urls:
        # get_html honours robots.txt and the disk cache; scrape_page only parses.
        fetched = await http.get_html(url)
        if not fetched:
            continue
        pages.append(scrape_page(fetched["html"], fetched["finalUrl"]))

    official_hosts = registry.official_hosts(product.brand)
    quotes, read_cost = await _read_prices(product, pages, llm, official_hosts)
    cost += read_cost

    finding = judge(product, quotes)
    finding.cost_usd = round(cost, 6)
    bus.emit(
        {
            "type": "price:done",
            "sku": product.sku,
            "title": product.title,
            "verdict": finding.verdict,
            "quotes": len(quotes),
            "suggestedMrp": finding.suggested_mrp,
            "costUsd": finding.cost_usd,
        }
    )
    return finding


async def run_price_watch(
    *,
    config: AgentConfig | None = None,
    on_event=None,
    only: list[str] | None = None,
    limit: int | None = None,
    max_pages: int = 6,
) -> PriceReport:
    """Sweeps the published catalogue and writes the findings for review."""
    cfg = config or load_config()
    bus = EventBus()
    if on_event:
        bus.on(on_event)

    run_id = f"price-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    started_at = now_iso()

    data_dir = Path(cfg.data_dir)
    products: list[WatchProduct] = []
    for path in sorted(data_dir.glob("*.json")):
        if path.name == "index.json":
            continue
        raw = read_json(path)
        if not isinstance(raw, dict):
            continue
        try:
            product = WatchProduct.model_validate(raw)
        except Exception:  # noqa: BLE001
            continue
        # Only what is actually on the shop's website — a draft has no card to be wrong.
        if product.status == "ready":
            products.append(product)

    if only:
        needles = [n.lower() for n in only]
        products = [
            p for p in products
            if any(n in p.brand.lower() or n in p.model_number.lower() or n in p.sku for n in needles)
        ]
    if limit is not None:
        products = products[:limit]

    bus.emit({"type": "price:start", "runId": run_id, "watches": len(products)})

    cache = Cache(Path(cfg.cache_dir), cfg.cache)
    http = HttpClient(cfg, cache)
    llm = OpenRouterClient(cfg, cache)
    registry = BrandRegistry(Path(cfg.brands_path))

    findings: list[PriceFinding] = []
    try:
        await llm.prepare()
        semaphore = asyncio.Semaphore(max(1, cfg.concurrency))

        async def guarded(product: WatchProduct) -> PriceFinding:
            async with semaphore:
                try:
                    return await _check_one(
                        product, http=http, llm=llm, registry=registry, bus=bus, max_pages=max_pages
                    )
                except Exception as error:  # noqa: BLE001 - one bad row must not end the sweep
                    finding = judge(product, [])
                    finding.note = f"Check failed: {error}"
                    return finding

        findings = list(await asyncio.gather(*(guarded(p) for p in products)))
    finally:
        registry.save()
        await http.aclose()
        await llm.aclose()

    report = PriceReport(
        run_id=run_id,
        started_at=started_at,
        finished_at=now_iso(),
        checked=len(findings),
        with_data=sum(1 for f in findings if f.verdict != "no-data"),
        proposals=sum(1 for f in findings if f.suggested_mrp is not None),
        cost_usd=round(sum(f.cost_usd for f in findings), 6),
        findings=sorted(findings, key=lambda f: (f.suggested_mrp is None, f.title.lower())),
    )

    # Written where the stock room reads it. Nothing is applied here on purpose.
    write_json(Path(cfg.data_dir).parent / "price-watch.json", report.dump())

    bus.emit(
        {
            "type": "price:report",
            "runId": run_id,
            "checked": report.checked,
            "proposals": report.proposals,
            "costUsd": report.cost_usd,
        }
    )
    return report
