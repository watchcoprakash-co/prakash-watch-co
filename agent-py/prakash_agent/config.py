"""Central configuration.

Every tunable lives here. Nothing else reads os.environ directly, so the FastAPI
server and the CLI can both hand the graph an explicit config object.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv

# The repo keeps one .env at the root, shared by the Next.js app and this agent.
REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

CollectionId = Literal[
    "swiss-automatic",
    "dress-quartz",
    "dive-sport",
    "chronograph",
    "solar-eco",
    "connected",
]

COLLECTIONS: tuple[CollectionId, ...] = (
    "swiss-automatic",
    "dress-quartz",
    "dive-sport",
    "chronograph",
    "solar-eco",
    "connected",
)

# The six families the storefront already renders.
COLLECTION_META: dict[str, dict[str, str]] = {
    "swiss-automatic": {"no": "001", "name": "Swiss Automatic", "note": "Mechanical, exhibition caseback"},
    "dress-quartz": {"no": "002", "name": "Dress Quartz", "note": "Slim, leather, under 8mm"},
    "dive-sport": {"no": "003", "name": "Dive & Sport", "note": "300m, rotating bezel"},
    "chronograph": {"no": "004", "name": "Chronograph", "note": "Tachymeter, sub-dials"},
    "solar-eco": {"no": "005", "name": "Solar & Eco", "note": "Light powered, no battery"},
    "connected": {"no": "006", "name": "Connected", "note": "Hybrid smart, steel case"},
}

# Mid-tier GPT only: a catalog run touches every row, so cost scales with the sheet.
MODEL_FALLBACKS = ("openai/gpt-5.4-mini", "openai/gpt-5-mini", "openai/gpt-5.4-nano", "openai/gpt-5-nano")
VISION_FALLBACKS = ("openai/gpt-5.4-mini", "openai/gpt-5-mini", "openai/gpt-5.4-nano", "openai/gpt-5-nano")
SEARCH_FALLBACKS = ("openai/gpt-5.4-nano", "openai/gpt-5-nano", "openai/gpt-5.4-mini", "openai/gpt-5-mini")


def _num(name: str, fallback: float) -> float:
    raw = os.getenv(name)
    try:
        value = float(raw) if raw not in (None, "") else fallback
    except ValueError:
        return fallback
    return value if value >= 0 else fallback


def _int(name: str, fallback: int) -> int:
    return int(_num(name, fallback))


def _bool(name: str, fallback: bool) -> bool:
    raw = os.getenv(name)
    if raw in (None, ""):
        return fallback
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class AgentConfig:
    """Immutable run configuration."""

    api_key: str = ""
    model: str = ""
    vision_model: str = ""
    search_model: str = ""
    app_url: str = "https://prakashwatch.co"
    app_title: str = "Prakash Watch Co. Catalog Agent"

    # 'parallel' measured ~$0.0014/search against ~$0.0118 for the default backend.
    search_engine: str = "parallel"
    search_mode: str = "turbo"
    #: Read only Indian sources — the brands' Indian sites and India's authorised
    #: retailers. A foreign storefront lists a different reference at a different
    #: price under a warranty the buyer does not get.
    india_only: bool = False

    concurrency: int = 3
    max_sources: int = 4
    max_images: int = 10
    min_image_width: int = 600
    image_mode: Literal["download", "reference"] = "download"
    #: Where photographs may come from.
    #:   strict  — the brand's own site only; no photograph if it will not serve us
    #:   prefer  — the brand's own site, falling back when it is blocked or has none
    #:   off     — any source, ranked as usual
    #: 'prefer' is the default because several brands (every Casio domain, and
    #: titan.co.in) answer automated readers with 403, and a listing with no
    #: picture is worse than one with a retailer's picture of the right watch.
    official_images: Literal["strict", "prefer", "off"] = "off"
    #: Cut the watch off whatever it was photographed against.
    image_cutout: bool = True
    #: Backdrop applied to cutouts: "transparent", a preset name (studio-dark,
    #: panel, ink, studio-light, white, bone) or a hex colour. Transparency keeps
    #: the choice open, so the site can decide per page.
    image_background: str = "transparent"
    #: Square canvas the watch is centred on, so every listing frames alike.
    image_canvas: int = 1600

    timeout_s: float = 20.0
    host_delay_s: float = 1.2
    respect_robots: bool = True
    user_agent: str = (
        "PrakashWatchCoCatalogBot/1.0 (+https://prakashwatch.co/about; catalog listing research)"
    )

    cache: bool = True
    dry_run: bool = False
    force: bool = False

    data_dir: Path = field(default_factory=lambda: REPO_ROOT / "nextjs" / "data" / "catalog")
    #: Outside public/, because `next start` snapshots public/ at boot and would
    #: 404 anything the agent wrote afterwards. Served by the /media route instead.
    image_dir: Path = field(default_factory=lambda: REPO_ROOT / "nextjs" / "data" / "media")
    cache_dir: Path = field(default_factory=lambda: REPO_ROOT / ".agent-cache")
    report_dir: Path = field(default_factory=lambda: REPO_ROOT / "nextjs" / "data" / "runs")
    #: The brand memory base: official sites, learned once and reused.
    brands_path: Path = field(default_factory=lambda: REPO_ROOT / "nextjs" / "data" / "brands.json")
    upload_dir: Path = field(default_factory=lambda: REPO_ROOT / "nextjs" / "data" / "uploads")
    image_url_base: str = "/media"

    budget_usd: float = 0.0

    def replace(self, **changes: object) -> "AgentConfig":
        return replace(self, **changes)  # type: ignore[arg-type]


def load_config(**overrides: object) -> AgentConfig:
    """Builds a config from the environment, then applies explicit overrides."""
    base = AgentConfig(
        api_key=os.getenv("OPENROUTER_API_KEY", ""),
        model=os.getenv("OPENROUTER_MODEL") or MODEL_FALLBACKS[0],
        vision_model=os.getenv("OPENROUTER_VISION_MODEL") or VISION_FALLBACKS[0],
        search_model=os.getenv("OPENROUTER_SEARCH_MODEL") or SEARCH_FALLBACKS[0],
        app_url=os.getenv("OPENROUTER_APP_URL") or "https://prakashwatch.co",
        app_title=os.getenv("OPENROUTER_APP_TITLE") or "Prakash Watch Co. Catalog Agent",
        search_engine=os.getenv("AGENT_SEARCH_ENGINE") or "parallel",
        search_mode=os.getenv("AGENT_SEARCH_MODE") or "turbo",
        india_only=_bool("AGENT_INDIA_ONLY", False),
        concurrency=_int("AGENT_CONCURRENCY", 3),
        max_sources=_int("AGENT_MAX_SOURCES", 4),
        max_images=_int("AGENT_MAX_IMAGES", 10),
        min_image_width=_int("AGENT_MIN_IMAGE_WIDTH", 600),
        image_mode="reference" if os.getenv("AGENT_IMAGE_MODE") == "reference" else "download",
        official_images=(os.getenv("AGENT_OFFICIAL_IMAGES") or "off"),  # type: ignore[arg-type]
        image_cutout=_bool("AGENT_IMAGE_CUTOUT", True),
        image_background=os.getenv("AGENT_IMAGE_BACKGROUND") or "transparent",
        image_canvas=_int("AGENT_IMAGE_CANVAS", 1600),
        timeout_s=_num("AGENT_TIMEOUT_MS", 20_000) / 1000,
        host_delay_s=_num("AGENT_HOST_DELAY_MS", 1_200) / 1000,
        respect_robots=_bool("AGENT_RESPECT_ROBOTS", True),
        user_agent=os.getenv("AGENT_USER_AGENT") or AgentConfig.user_agent,
        cache=_bool("AGENT_CACHE", True),
        budget_usd=_num("AGENT_BUDGET_USD", 0.0),
    )
    return base.replace(**overrides) if overrides else base
