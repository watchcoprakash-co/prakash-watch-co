"""Turning quoted specifications into things a shopper can filter by.

Sources write the same fact a dozen ways. Across this catalogue alone the
movement appears as "Quartz", "quartz", "Analog Quartz" and "Quartz: Battery";
water resistance as "10 bar", "10 Bar (Swim)", "100m", "100 meters" and "20 bara";
and one Croatian retailer contributed "gumeno kućište" for a resin case. Eleven
distinct movements and twenty-one water-resistance strings are useless as filters.

So the specification table keeps the source's exact words — that is what is
cited and defensible — while the sidebar filters on a small controlled vocabulary
derived from them here. Anything unrecognised is left out of the facets rather
than guessed at: a filter that quietly mis-files a watch is worse than one that
does not offer it.
"""

from __future__ import annotations

import re

from .models import Attributes, WatchProduct

# --- Movement ------------------------------------------------------------------

MOVEMENT_RULES: tuple[tuple[str, str], ...] = (
    ("solar", r"solar|eco[- ]?drive|light[- ]powered|tough solar"),
    ("smart", r"smart|bluetooth|connected|hybrid|fitness|step"),
    ("automatic", r"automatic|self[- ]winding|kinetic"),
    ("hand-wound", r"hand[- ]wound|manual winding only|mechanical hand"),
    ("quartz", r"quartz|battery|digital"),
    ("mechanical", r"mechanical"),
)

MOVEMENT_LABELS = {
    "automatic": "Automatic",
    "quartz": "Quartz",
    "solar": "Solar",
    "smart": "Smart / hybrid",
    "hand-wound": "Hand-wound",
    "mechanical": "Mechanical",
}

# --- Case material --------------------------------------------------------------

CASE_RULES: tuple[tuple[str, str], ...] = (
    ("titanium", r"titanium"),
    ("ceramic", r"ceramic"),
    ("gold-tone", r"gold|rose gold|ip gold"),
    # Checked before steel: many G-Shocks are "resin with a steel back".
    ("resin", r"resin|rubber|plastic|carbon|biomass|gumeno"),
    ("steel", r"stainless|steel|metal|čelik"),
    ("brass", r"brass"),
)

CASE_LABELS = {
    "steel": "Stainless steel",
    "resin": "Resin",
    "titanium": "Titanium",
    "ceramic": "Ceramic",
    "gold-tone": "Gold tone",
    "brass": "Brass",
}

# --- Strap ----------------------------------------------------------------------

STRAP_RULES: tuple[tuple[str, str], ...] = (
    ("leather", r"leather|calf|croco|suede|koža"),
    ("resin", r"resin|rubber|silicone|urethane|silikon"),
    ("fabric", r"fabric|nato|nylon|canvas|textile"),
    ("bracelet", r"bracelet|stainless|steel|metal|titanium|mesh|čelik"),
)

STRAP_LABELS = {
    "bracelet": "Steel bracelet",
    "leather": "Leather",
    "resin": "Resin",
    "fabric": "Fabric",
}

# --- Dial colour ----------------------------------------------------------------

COLOUR_RULES: tuple[tuple[str, str], ...] = (
    ("rose-gold", r"rose gold|pink gold"),
    ("gold", r"gold|champagne"),
    ("silver", r"silver|steel|grey|gray|gunmetal|graphite|charcoal|anthracite"),
    ("white", r"white|ivory|cream|mother of pearl|pearl"),
    ("black", r"black|onyx"),
    ("blue", r"blue|navy|teal|turquoise"),
    ("green", r"green|olive|khaki|emerald"),
    ("red", r"red|maroon|burgundy|crimson"),
    ("brown", r"brown|tan|bronze|coffee|chocolate"),
    ("purple", r"purple|violet|lilac|lavender"),
    ("pink", r"pink|peach"),
    ("yellow", r"yellow|lime"),
    ("orange", r"orange"),
)

COLOUR_LABELS = {key: key.replace("-", " ").title() for key, _ in COLOUR_RULES}

# --- Complications --------------------------------------------------------------

FUNCTION_RULES: tuple[tuple[str, str], ...] = (
    ("chronograph", r"chronograph|stopwatch|stop watch|tachymeter"),
    ("day-date", r"day[/ -]?date|day and date|day display"),
    ("date", r"\bdate\b"),
    ("gmt", r"gmt|world time|dual time|second time"),
    ("alarm", r"alarm"),
    ("backlight", r"backlight|illuminat|lumibrite|led light"),
    ("bluetooth", r"bluetooth|app|smartphone link|step"),
    ("power-reserve", r"power reserve indicator"),
)

FUNCTION_LABELS = {
    "chronograph": "Chronograph",
    "date": "Date",
    "day-date": "Day & date",
    "gmt": "GMT / world time",
    "alarm": "Alarm",
    "backlight": "Backlight",
    "bluetooth": "Bluetooth",
    "power-reserve": "Power reserve",
}

# --- Buckets --------------------------------------------------------------------

WATER_LABELS = {
    "30": "30 m — splashes",
    "50": "50 m — showering",
    "100": "100 m — swimming",
    "200": "200 m+ — diving",
}

SIZE_LABELS = {
    "under-36": "Under 36 mm",
    "36-40": "36 – 40 mm",
    "40-44": "40 – 44 mm",
    "over-44": "Over 44 mm",
}


def _match(value: str | None, rules: tuple[tuple[str, str], ...]) -> str | None:
    """First rule whose pattern appears in the text. Order encodes precedence."""
    if not value:
        return None
    lowered = value.lower()
    for key, pattern in rules:
        if re.search(pattern, lowered):
            return key
    return None


def water_bucket(value: str | None) -> str | None:
    """Normalises depth ratings written as metres, bar or atmospheres.

    "10 bar", "10 Bar (Swim)", "100m", "100 meters" and "20 bara" all describe two
    of only four useful answers, so they are rounded down to the nearest rating a
    shopper actually chooses between.
    """
    if not value:
        return None
    lowered = value.lower()

    metres: float | None = None
    if (bar := re.search(r"(\d+(?:\.\d+)?)\s*(bar|atm)", lowered)) is not None:
        metres = float(bar.group(1)) * 10
    elif (m := re.search(r"(\d+(?:\.\d+)?)\s*(m\b|metre|meter)", lowered)) is not None:
        metres = float(m.group(1))
    elif re.search(r"water[- ]?resist", lowered):
        metres = 30  # Stated but unquantified: the weakest claim it could mean.

    if metres is None:
        return None
    if metres >= 200:
        return "200"
    if metres >= 100:
        return "100"
    if metres >= 50:
        return "50"
    return "30"


def size_bucket(diameter: float | None) -> str | None:
    if diameter is None or diameter <= 0:
        return None
    if diameter < 36:
        return "under-36"
    if diameter < 40:
        return "36-40"
    if diameter < 44:
        return "40-44"
    return "over-44"


def derive(attributes: Attributes, model_name: str | None = None) -> dict[str, list[str] | str | None]:
    """Builds the filterable facets for one watch."""
    haystack = " ".join(
        filter(
            None,
            [
                attributes.movement or "",
                attributes.caliber or "",
                " ".join(attributes.functions),
                model_name or "",
            ],
        )
    )

    functions: list[str] = []
    for key, pattern in FUNCTION_RULES:
        if re.search(pattern, haystack.lower()):
            functions.append(key)
    # A day-date already tells the shopper there is a date.
    if "day-date" in functions and "date" in functions:
        functions.remove("date")

    return {
        "movement": _match(haystack, MOVEMENT_RULES),
        "caseMaterial": _match(attributes.case_material, CASE_RULES),
        "strap": _match(attributes.strap_material, STRAP_RULES),
        "dialColour": _match(attributes.dial_colour, COLOUR_RULES),
        "waterResistance": water_bucket(attributes.water_resistance),
        "caseSize": size_bucket(attributes.case_diameter_mm),
        "functions": functions,
    }


def derive_for(product: WatchProduct) -> dict[str, list[str] | str | None]:
    return derive(product.attributes, product.model_name)
