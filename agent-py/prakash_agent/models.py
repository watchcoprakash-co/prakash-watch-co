"""The catalog data contract.

These models serialise to exactly the JSON the Next.js storefront and admin panel
already read (`nextjs/agent/types.ts` is the mirror image). Field names are
snake_case in Python and camelCase on disk, so the two halves stay idiomatic
without the artifact format changing.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Status = Literal["ready", "needs_review", "failed"]
Gender = Literal["men", "women", "unisex"]
SourceKind = Literal["official", "retailer", "marketplace", "editorial", "other"]
ImageKind = Literal["product", "wrist", "detail", "lifestyle", "packaging", "other"]

REVIEW_FLAGS = (
    "no-images",
    "few-images",
    "low-image-match",
    "no-official-source",
    "no-sources",
    "sparse-specs",
    "model-mismatch",
    "price-outlier",
    "unverified-copy",
    "manual-images-only",
    "provisional-image",
    "llm-unavailable",
    "no-price",
    "estimated-price",
)
ReviewFlag = Literal[
    "no-images",
    "few-images",
    "low-image-match",
    "no-official-source",
    "no-sources",
    "sparse-specs",
    "model-mismatch",
    "price-outlier",
    "unverified-copy",
    "manual-images-only",
    "provisional-image",
    "llm-unavailable",
    "no-price",
    "estimated-price",
]

REVIEW_FLAG_EXPLANATIONS: dict[str, str] = {
    "no-images": "No usable photograph was found — the listing cannot go live without one.",
    "few-images": "Only one image. A second angle makes the listing considerably stronger.",
    "low-image-match": "The photographs may show a different colourway or reference.",
    "no-official-source": "Nothing from the brand's own site — specifications came from resellers.",
    "no-sources": "No page could be read at all. Check the reference number.",
    "sparse-specs": "Fewer than four core specifications were confirmed.",
    "model-mismatch": "The pages found appear to describe a different reference.",
    "price-outlier": "A source quotes a very different price — often a sign it describes another reference. The shop's price is unaffected.",
    "unverified-copy": "No specification was confirmed, so the copy is generic.",
    "manual-images-only": "Only the shop's own images were used.",
    "provisional-image": "No photograph could be confirmed as this exact reference, so the closest one found is shown. Check it before publishing.",
    "llm-unavailable": "Written without research (dry run or model unavailable).",
    "no-price": "No price yet — the listing shows 'price on request'. Set one when you know it.",
    "estimated-price": "Price taken from what the trade is charging, not from the shop's own sheet. Check it before relying on it.",
}


class Model(BaseModel):
    """Base: camelCase on the wire, snake_case in Python."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")

    def dump(self) -> dict[str, Any]:
        return self.model_dump(by_alias=True)


class SheetRow(Model):
    row_number: int
    sheet: str
    brand: str
    model_number: str
    #: None when the sheet is a brand master with no price column at all. Such a
    #: row is researched and held; it can never be published unpriced.
    price: float | None = None
    mrp: float | None = None
    cost_price: float | None = None
    model_name: str | None = None
    gender: str | None = None
    collection_hint: str | None = None
    quantity: int | None = None
    product_url: str | None = None
    image_urls: list[str] = Field(default_factory=list)
    notes: str | None = None
    #: Brand website named in the sheet header — the best hint for finding a page.
    brand_site: str | None = None
    #: The manufacturer's reference, when the sheet's model number turned out to be
    #: the shop's own internal code. Research uses this; identity stays with
    #: model_number so a re-uploaded sheet still finds its listing.
    reference: str | None = None


class SheetRowError(Model):
    row_number: int
    sheet: str
    raw: dict[str, Any] = Field(default_factory=dict)
    problems: list[str] = Field(default_factory=list)


class SheetParseResult(Model):
    rows: list[SheetRow] = Field(default_factory=list)
    errors: list[SheetRowError] = Field(default_factory=list)
    header_map: dict[str, str] = Field(default_factory=dict)
    unmapped_headers: list[str] = Field(default_factory=list)
    sheets: list[str] = Field(default_factory=list)
    skipped_sheets: list[dict[str, str]] = Field(default_factory=list)
    file_name: str = ""


class Source(Model):
    index: int
    url: str
    title: str = ""
    publisher: str = ""
    kind: SourceKind = "other"
    fetched_at: str = ""


class Spec(Model):
    label: str
    value: str
    #: Section heading, e.g. "Movement" or "Case".
    group: str = "Specification"
    #: Index into WatchProduct.sources. None means the agent could not attribute it.
    source_index: int | None = None


class ProductImage(Model):
    url: str
    width: int
    height: int
    alt: str = ""
    kind: ImageKind = "product"
    #: Explicit alias — to_camel would render this "blurDataUrl".
    blur_data_url: str | None = Field(default=None, alias="blurDataURL")
    source_url: str = ""
    source_page: str | None = None
    match_score: float = 0.0
    #: True when the watch was cut out and stored on transparency, so the site is
    #: free to choose the backdrop.
    has_alpha: bool = False
    #: Backdrop applied: "transparent", a preset name, a hex colour, or
    #: "original" when the photograph could not be separated from its background.
    background: str = "original"


class Copy(Model):
    tagline: str = ""
    short: str = ""
    long: str = ""
    bullets: list[str] = Field(default_factory=list)
    seo_title: str = ""
    seo_description: str = ""


class Price(Model):
    currency: Literal["INR"] = "INR"
    #: None until the shop sets one. The storefront never shows an unpriced watch.
    selling: float | None = None
    mrp: float | None = None
    discount_pct: int | None = None


class Attributes(Model):
    movement: str | None = None
    caliber: str | None = None
    power_reserve: str | None = None
    case_material: str | None = None
    case_diameter_mm: float | None = None
    case_thickness_mm: float | None = None
    lug_width_mm: float | None = None
    crystal: str | None = None
    dial_colour: str | None = None
    bezel: str | None = None
    strap_material: str | None = None
    strap_colour: str | None = None
    clasp_type: str | None = None
    water_resistance: str | None = None
    functions: list[str] = Field(default_factory=list)
    warranty: str | None = None
    launch_year: int | None = None


class Facets(Model):
    """Normalised, filterable view of the specifications."""

    movement: str | None = None
    case_material: str | None = None
    strap: str | None = None
    dial_colour: str | None = None
    water_resistance: str | None = None
    case_size: str | None = None
    functions: list[str] = Field(default_factory=list)


class Confidence(Model):
    overall: float = 0.0
    identity: float = 0.0
    specs: float = 0.0
    images: float = 0.0


class Review(Model):
    flags: list[ReviewFlag] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class Meta(Model):
    run_id: str
    sheet_row: int
    source_file: str
    model: str
    created_at: str
    updated_at: str
    cost_usd: float = 0.0
    queries: list[str] = Field(default_factory=list)


class WatchProduct(Model):
    sku: str
    slug: str
    status: Status
    brand: str
    model_number: str
    model_name: str | None = None
    title: str
    price: Price
    #: What the shop paid per unit, when the sheet says. Needed for gross profit,
    #: cost of goods sold and an honest stock valuation.
    cost_price: float | None = None
    collection: str | None = None
    gender: Gender | None = None
    tags: list[str] = Field(default_factory=list)
    in_stock: bool = True
    quantity: int | None = None
    attributes: Attributes = Field(default_factory=Attributes)
    specs: list[Spec] = Field(default_factory=list)
    #: Named listing_copy in Python because `copy` shadows a BaseModel method;
    #: it is still "copy" on disk, which is what the storefront reads.
    listing_copy: Copy = Field(default_factory=Copy, alias="copy")
    images: list[ProductImage] = Field(default_factory=list)
    #: Backdrop chosen to suit this watch's colour, from the generated library.
    backdrop_id: str | None = None
    #: Controlled vocabulary derived from the specifications, for the filters.
    facets: Facets = Field(default_factory=Facets)
    sources: list[Source] = Field(default_factory=list)
    confidence: Confidence = Field(default_factory=Confidence)
    review: Review = Field(default_factory=Review)
    meta: Meta


class CatalogEntry(Model):
    """Compact record the collections grid reads."""

    sku: str
    slug: str
    status: Status
    brand: str
    model_number: str
    model_name: str | None = None
    title: str
    price: Price
    #: What the shop paid per unit, when the sheet says. Needed for gross profit,
    #: cost of goods sold and an honest stock valuation.
    cost_price: float | None = None
    collection: str | None = None
    gender: Gender | None = None
    in_stock: bool = True
    backdrop_id: str | None = None
    facets: Facets = Field(default_factory=Facets)
    tags: list[str] = Field(default_factory=list)
    image: ProductImage | None = None
    tagline: str = ""


class RowResult(Model):
    row_number: int
    sku: str
    status: Literal["ready", "needs_review", "failed", "skipped", "updated"]
    product: WatchProduct | None = None
    error: str | None = None
    cost_usd: float = 0.0
    elapsed_ms: int = 0


class RunCounts(Model):
    rows_read: int = 0
    rows_rejected: int = 0
    ready: int = 0
    needs_review: int = 0
    failed: int = 0
    skipped: int = 0
    #: Already listed, and a later sheet moved its price, stock or cost.
    updated: int = 0
    images_saved: int = 0


class RunReport(Model):
    run_id: str
    started_at: str
    finished_at: str
    source_file: str
    model: str
    dry_run: bool = False
    counts: RunCounts = Field(default_factory=RunCounts)
    cost_usd: float = 0.0
    results: list[RowResult] = Field(default_factory=list)
    sheet_errors: list[SheetRowError] = Field(default_factory=list)


# --- Research-stage structures (internal; never written to disk) -----------------


class ScrapedPage(Model):
    url: str
    title: str = ""
    description: str = ""
    spec_pairs: list[tuple[str, str]] = Field(default_factory=list)
    text: str = ""
    image_urls: list[str] = Field(default_factory=list)
    listed_price: float | None = None


class Candidate(Model):
    url: str
    title: str = ""
    snippet: str = ""
    kind: SourceKind = "other"
    score: float = 0.0


class Fact(Model):
    field: str
    value: str
    source_index: int


class FactsResult(Model):
    matches_reference: bool = False
    match_confidence: float = 0.0
    mismatch_reason: str | None = None
    model_name: str | None = None
    collection: str | None = None
    gender: str | None = None
    facts: list[Fact] = Field(default_factory=list)
    functions: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    cost_usd: float = 0.0


Annotated  # re-exported for graph state typing convenience
