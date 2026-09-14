"""Enrichment: turn read pages into verified facts, then into shop copy.

The governing rule is that the model may only report what a source actually said.
Every fact carries the index of the page it came from, and any fact whose citation
does not resolve is dropped before it can reach a product page. Watch
specifications are exactly what a language model invents fluently, and a shop that
publishes an invented 300 m rating owns that claim at the counter.
"""

from __future__ import annotations

import re

from .config import COLLECTIONS
from .models import Attributes, Copy, Fact, FactsResult, ScrapedPage, SheetRow, Source
from .openrouter import OpenRouterClient
from .research import render_evidence
from .util import clamp01, format_inr, parse_mm, parse_year, squish, truncate

FACT_FIELDS = (
    # Movement
    "movement", "caliber", "accuracy", "power_reserve", "battery_type", "battery_life", "jewels",
    # Case
    "case_material", "bezel_material", "case_diameter_mm", "case_thickness_mm", "case_length_mm",
    "weight_g", "crystal", "caseback", "coating",
    # Dial
    "dial_colour", "hands_markers", "lume",
    # Band
    "strap_material", "strap_colour", "clasp_type", "lug_width_mm",
    # Durability
    "water_resistance", "shock_resistance",
    # Functions
    "illumination", "world_time", "alarms", "stopwatch", "timer", "calendar", "connectivity",
    # Provenance
    "warranty", "launch_year", "origin",
)

#: Spec sections, in the order a product page reads best — the same shape the
#: brands themselves use, so a shopper comparing our page against Casio's or
#: Seiko's finds the same facts in the same order.
FACT_GROUPS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Movement", ("movement", "caliber", "accuracy", "power_reserve", "battery_type", "battery_life", "jewels")),
    ("Case", ("case_material", "bezel_material", "case_diameter_mm", "case_thickness_mm", "case_length_mm",
              "weight_g", "crystal", "caseback", "coating")),
    ("Dial", ("dial_colour", "hands_markers", "lume")),
    ("Band", ("strap_material", "strap_colour", "clasp_type", "lug_width_mm")),
    ("Durability", ("water_resistance", "shock_resistance")),
    ("Functions", ("illumination", "world_time", "alarms", "stopwatch", "timer", "calendar", "connectivity")),
    ("The details", ("warranty", "launch_year", "origin")),
)

FACT_LABELS: dict[str, str] = {
    "movement": "Movement",
    "caliber": "Calibre",
    "accuracy": "Accuracy",
    "power_reserve": "Power reserve",
    "battery_type": "Battery",
    "battery_life": "Battery life",
    "jewels": "Jewels",
    "case_material": "Case material",
    "bezel_material": "Bezel",
    "case_diameter_mm": "Case diameter",
    "case_thickness_mm": "Case thickness",
    "case_length_mm": "Lug to lug",
    "weight_g": "Weight",
    "crystal": "Crystal",
    "caseback": "Caseback",
    "coating": "Finish / coating",
    "dial_colour": "Dial",
    "hands_markers": "Hands & markers",
    "lume": "Luminous",
    "strap_material": "Strap / bracelet",
    "strap_colour": "Strap colour",
    "clasp_type": "Clasp",
    "lug_width_mm": "Lug width",
    "water_resistance": "Water resistance",
    "shock_resistance": "Shock resistance",
    "illumination": "Illumination",
    "world_time": "World time",
    "alarms": "Alarms",
    "stopwatch": "Stopwatch",
    "timer": "Countdown timer",
    "calendar": "Calendar",
    "connectivity": "Connectivity",
    "warranty": "Warranty",
    "launch_year": "Introduced",
    "origin": "Made in",
}

FACTS_SCHEMA = {
    "name": "watch_facts",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "matches_reference", "match_confidence", "mismatch_reason", "model_name",
            "collection", "gender", "facts", "functions", "tags",
        ],
        "properties": {
            "matches_reference": {
                "type": "boolean",
                "description": "True only if a source clearly describes this exact reference number.",
            },
            "match_confidence": {"type": "number", "description": "0 to 1 that the sources describe this exact watch."},
            "mismatch_reason": {
                "type": ["string", "null"],
                "description": "If the sources describe a different watch, say which and how it differs.",
            },
            "model_name": {"type": ["string", "null"], "description": "Official model name, e.g. 'Gentleman Powermatic 80'."},
            "collection": {"type": ["string", "null"], "enum": [*COLLECTIONS, None]},
            "gender": {"type": ["string", "null"], "enum": ["men", "women", "unisex", None]},
            "facts": {
                "type": "array",
                "description": "One entry per specification attributable to a source. Omit anything not stated.",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["field", "value", "source_index"],
                    "properties": {
                        "field": {"type": "string", "enum": list(FACT_FIELDS)},
                        "value": {"type": "string", "description": "Exactly as stated, e.g. '40 mm', '100 m (10 bar)'."},
                        "source_index": {"type": "integer", "description": "Index of the SOURCE block it came from."},
                    },
                },
            },
            "functions": {"type": "array", "items": {"type": "string"}, "description": "Complications, e.g. 'Date'."},
            "tags": {"type": "array", "items": {"type": "string"}, "description": "3-6 short lowercase search tags."},
        },
    },
}

COPY_SCHEMA = {
    "name": "watch_copy",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["tagline", "short", "long", "bullets", "seo_title", "seo_description", "image_alt"],
        "properties": {
            "tagline": {"type": "string", "description": "Under 60 characters. No brand name, no price."},
            "short": {"type": "string", "description": "One sentence under 160 characters for the collection card."},
            "long": {"type": "string", "description": "Two short paragraphs separated by a blank line."},
            "bullets": {"type": "array", "items": {"type": "string"}, "description": "3 to 5 short factual points."},
            "seo_title": {"type": "string", "description": "Under 60 characters, includes brand and model."},
            "seo_description": {"type": "string", "description": "Under 155 characters."},
            "image_alt": {"type": "string", "description": "Alt text describing the watch for a screen reader."},
        },
    },
}

EXTRACTION_SYSTEM = """You are a cataloguing assistant for an authorised multi-brand watch retailer in India.

You are given numbered SOURCE blocks scraped from the web and one watch from the shop's stock list.

Rules, in order of importance:
1. Only report a specification if a SOURCE block actually states it. Never infer a value from the brand's other models, never estimate, never fill a gap with what is typical for the category.
2. Every fact must carry the source_index of the block you read it in. If you cannot point to a block, omit the fact entirely. A missing specification is correct; an invented one is a false claim the shop has to answer for.
3. Check the reference number carefully. Search results frequently return a neighbouring reference (a different dial or bracelet) or an unrelated model from the same family. Indian-market references also carry regional suffixes the brand's global pages omit, so EFR-539DE-8AV and EFR-539DE-8A are usually the same watch, while EFR-539DE-8AV and EFR-539DE-3AV are not.

   matches_reference answers one question only: do the sources describe THIS watch? It is not a judgement of how authoritative the source is. A news article, a review or a retailer listing that clearly covers this reference means matches_reference is true. Set it to false only when the sources describe a genuinely different watch, or when you cannot tell which watch they describe — and say which one they describe in mismatch_reason. Never set it to false and then explain that the watch does in fact match.

   Either way, still report any facts that genuinely are about this reference.
4. Prefer official brand sources over retailers, and retailers over marketplaces and blogs, when they disagree.
5. Copy values as stated, including units.
6. Be exhaustive. A brand's own product page lists twenty or thirty specifications, and a shopper comparing our listing against it should not find ours thinner. Fill every field the sources support — battery type and life, accuracy, weight, lug-to-lug, caseback, luminous material, illumination, world time, alarms, stopwatch, countdown timer, calendar, shock resistance, country of manufacture. Rule 1 still governs: report only what a source states, and leave the rest out."""

COPY_SYSTEM = """You write product copy for Prakash Watch Co., an authorised multi-brand watch boutique in Delhi NCR, established 1976.

Voice: restrained, editorial, concrete. The house tone is "Time, kept well" — watches are sold, sized and serviced in person by people who know them. Short sentences. Specific nouns.

Hard rules:
1. Use only the confirmed specifications given to you. If a specification is not listed, do not mention it — no invented water resistance, movements, materials or sizes.
2. No hype, no superlatives, no "elevate your style", no exclamation marks, no invented heritage or awards.
3. Never promise stock, delivery times, discounts or authenticity guarantees beyond what you are told.
4. British-Indian English. Prices in rupees when mentioned at all.
5. Write about the watch, not about the buyer's aspirations."""


async def extract_facts(
    row: SheetRow,
    sources: list[Source],
    pages: list[ScrapedPage],
    llm: OpenRouterClient,
) -> FactsResult:
    """Extracts verified specifications from the evidence bundle."""
    if not pages:
        return FactsResult(
            model_name=row.model_name,
            mismatch_reason="No sources could be read for this watch.",
        )

    prompt_lines = [
        "Watch from the stock list:",
        f"  Brand: {row.brand}",
        f"  Reference / model number: {row.reference or row.model_number}",
    ]
    if row.reference and row.reference != row.model_number:
        # Both names, or the model reports a mismatch on a page that is in fact
        # about the right watch: the shop lists Casio as A1149 while every page
        # calls it LTP-V300L-1AUDF, and judging by the shop's code alone flagged
        # every one of those as the wrong watch.
        prompt_lines.append(
            f"  The shop's own internal code for this watch is {row.model_number}. "
            f"A page describing {row.reference} IS this watch — treat either name as a match."
        )
    if row.model_name:
        prompt_lines.append(f"  Model name as written by the shop: {row.model_name}")
    if row.gender:
        prompt_lines.append(f"  Gender as written by the shop: {row.gender}")
    if row.collection_hint:
        prompt_lines.append(f"  Category as written by the shop: {row.collection_hint}")
    prompt_lines.append(f"\nSources:\n\n{render_evidence(sources, pages)}")

    data, cost = await llm.chat_json(
        model=llm.model,
        max_tokens=6000,
        schema=FACTS_SCHEMA,
        messages=[
            {"role": "system", "content": EXTRACTION_SYSTEM},
            {"role": "user", "content": "\n".join(prompt_lines)},
        ],
    )

    # Trust nothing structurally: drop facts whose citation does not resolve.
    facts: list[Fact] = []
    for entry in data.get("facts") or []:
        if not isinstance(entry, dict):
            continue
        field = entry.get("field")
        value = squish(str(entry.get("value", "")))
        index = entry.get("source_index")
        if field in FACT_FIELDS and value and isinstance(index, int) and 0 <= index < len(sources):
            facts.append(Fact(field=field, value=value, source_index=index))

    return FactsResult(
        matches_reference=bool(data.get("matches_reference")),
        match_confidence=clamp01(data.get("match_confidence")),
        mismatch_reason=squish(data.get("mismatch_reason")) or None,
        model_name=squish(data.get("model_name")) or row.model_name,
        collection=data.get("collection"),
        gender=data.get("gender"),
        facts=facts,
        functions=[squish(f) for f in (data.get("functions") or []) if squish(f)][:8],
        tags=[squish(t).lower() for t in (data.get("tags") or []) if squish(t)][:6],
        cost_usd=cost,
    )



#: A rupee figure in any of the shapes copy tends to use.
_MONEY = re.compile(r"(₹|\bRs\.?\b|\bINR\b|\bMRP\b)\s*[\d,.]*", re.IGNORECASE)


def strip_prices(copy: Copy) -> Copy:
    """Removes any money from copy for a watch the sheet did not price.

    The prompt already says not to mention a price, and the model does anyway:
    it reads "MRP ₹12,000" off a source page and repeats it. A price the shop has
    not set must never appear on its own listing, so this is enforced rather than
    requested — the same rule that keeps researched prices out of the artifact.
    """
    def clean_sentences(text: str) -> str:
        parts = re.split(r"(?<=[.!?])\s+", text)
        return " ".join(p for p in parts if not _MONEY.search(p)).strip()

    return Copy(
        tagline=copy.tagline if not _MONEY.search(copy.tagline) else "",
        short=clean_sentences(copy.short),
        long="\n\n".join(
            clean_sentences(block) for block in copy.long.split("\n\n") if clean_sentences(block)
        ),
        bullets=[b for b in copy.bullets if not _MONEY.search(b)],
        seo_title=copy.seo_title if not _MONEY.search(copy.seo_title) else "",
        seo_description=clean_sentences(copy.seo_description),
    )


async def write_copy(row: SheetRow, facts: FactsResult, llm: OpenRouterClient) -> tuple[Copy, str, float]:
    """Writes the shop-facing copy from confirmed facts only."""
    confirmed = "\n".join(f"  - {FACT_LABELS[f.field]}: {f.value}" for f in facts.facts)
    name = row.model_name or facts.model_name

    prompt = (
        f"Watch: {row.brand}{f' {name}' if name else ''} (reference {row.reference or row.model_number})\n"
        f"Selling price: {format_inr(row.price) if row.price else 'not set — do not mention price'}\n"
        + (f"Worn by: {facts.gender}\n" if facts.gender else "")
        + (f"Functions: {', '.join(facts.functions)}\n" if facts.functions else "")
        + "\nConfirmed specifications (the only ones you may reference):\n"
        + (confirmed or "  (none confirmed — write only about the brand and model at a general level)")
        + "\n\nWrite the listing copy."
    )

    data, cost = await llm.chat_json(
        model=llm.model,
        max_tokens=3000,
        schema=COPY_SCHEMA,
        messages=[
            {"role": "system", "content": COPY_SYSTEM},
            {"role": "user", "content": prompt},
        ],
    )

    copy = Copy(
        tagline=truncate(squish(data.get("tagline", "")), 70),
        short=truncate(squish(data.get("short", "")), 180),
        long=(data.get("long") or "").strip(),
        bullets=[squish(b) for b in (data.get("bullets") or []) if squish(b)][:5],
        seo_title=truncate(squish(data.get("seo_title", "")), 70),
        seo_description=truncate(squish(data.get("seo_description", "")), 170),
    )
    # An unpriced watch must not carry a price anywhere in its copy.
    if row.price is None:
        copy = strip_prices(copy)

    return copy, squish(data.get("image_alt", "")), cost


def fallback_copy(row: SheetRow, model_name: str | None) -> Copy:
    """Deterministic copy for when the model is unavailable or nothing was confirmed."""
    name = f"{row.brand} {model_name}" if model_name else row.brand
    return Copy(
        tagline="In store, sized and serviced",
        short=f"{name}, reference {row.model_number}. Available at Prakash Watch Co.",
        long=(
            f"{name}, reference {row.model_number}.\n\n"
            "Stocked, sized and warranted in store. Full specifications are being confirmed — "
            "ask at the counter or call ahead and we will confirm before you visit."
        ),
        bullets=[
            f"Reference {row.model_number}",
            *( [format_inr(row.price)] if row.price else [] ),
            "Sized and serviced in house",
        ],
        seo_title=truncate(f"{name} {row.model_number}", 70),
        seo_description=truncate(
            f"{name}, reference {row.model_number}, at Prakash Watch Co. Authorised since 1976.", 170
        ),
    )


def to_attributes(facts: list[Fact], functions: list[str]) -> Attributes:
    """Converts extracted facts into the typed attribute block."""
    by_field: dict[str, str] = {}
    for fact in facts:
        by_field.setdefault(fact.field, fact.value)

    return Attributes(
        movement=by_field.get("movement"),
        caliber=by_field.get("caliber"),
        power_reserve=by_field.get("power_reserve"),
        case_material=by_field.get("case_material"),
        case_diameter_mm=parse_mm(by_field.get("case_diameter_mm")),
        case_thickness_mm=parse_mm(by_field.get("case_thickness_mm")),
        lug_width_mm=parse_mm(by_field.get("lug_width_mm")),
        crystal=by_field.get("crystal"),
        dial_colour=by_field.get("dial_colour"),
        bezel=by_field.get("bezel"),
        strap_material=by_field.get("strap_material"),
        strap_colour=by_field.get("strap_colour"),
        clasp_type=by_field.get("clasp_type"),
        water_resistance=by_field.get("water_resistance"),
        functions=functions,
        warranty=by_field.get("warranty"),
        launch_year=parse_year(by_field.get("launch_year")),
    )
