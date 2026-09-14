"""Looking a reference up in the brand's own shop, instead of searching for it.

Searching for a watch by reference mostly does not work. Measured over fourteen
brands, the best query phrasing confirmed 31 pages out of roughly five hundred
fetched, and Titan — the shop's largest brand — confirmed none at all under any
phrasing. When search finds nothing specific it settles for whatever it can
reach, which is the brand's homepage: no specifications, and a 1920x1040 banner
image the vision grader then spends money rejecting. That is what produced 50
model-mismatch flags in 85 listings.

Many Indian brand storefronts run on Shopify, which publishes the whole catalogue
at `/products.json` — title, description, variants with SKUs, and every product
image. Where that exists, a reference is not searched for, it is looked up: one
request per brand, cached, then an exact match on the reference gives the product
page URL directly. Measured on Alba, 52 of the shop's 76 references are in that
feed, with the model number in the title, the rupee price, five or six product
photographs and a full specification block.

This module only resolves the URL. The existing pipeline then reads that page as
it reads any other, so nothing downstream needs to know where the URL came from.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from .cache import Cache
from .http_client import HttpClient

#: A brand's catalogue changes slowly; a day is plenty and keeps runs cheap.
CATALOGUE_TTL_S = 24 * 60 * 60
#: Shopify serves at most 250 per page. The page walk stops on its own at a short
#: page, so this is only a runaway guard — set at four it was silently truncating
#: every catalogue to a thousand products, which is what made Titan look like 17%
#: coverage. (since_id paging is advertised but ignored by these stores: it
#: returns the same 250 rows forever, so pages are the only way through.)
PAGE_SIZE = 250
MAX_PAGES = 40

#: Indian multi-brand watch retailers that publish their catalogue, tried after
#: the brand's own shop and before search.
#:
#: Most brands do not publish a feed, and several refuse automated readers
#: outright, so their own site can never answer. A retailer that stocks them can.
#: Measured against the shop's 2,188 references: brand sites alone resolved 248
#: (11%); adding these took it to 1,096 (50%), and they are the *only* route to
#: Casio — 204 of 336 — whose every domain returns 403.
#:
#: A retailer is a weaker source than the maker, so it is consulted second and the
#: match is still exact on the reference: a near-match is how the wrong watch gets
#: listed. Prices from these are not trusted anywhere — the shop's sheet sets those.
#: Measured against the shop's own sheet. The first two carry the bulk of the
#: catalogue; the rest exist because 335 of 336 Casio rows are the shop's internal
#: codes (A1149, four characters) rather than Casio references, and a retailer
#: that indexes both is the only place that mapping can be read. Adding these four
#: took short-code resolution from 65 of 343 to 156 — 19% to 45%.
RETAILER_FEEDS = (
    "rameshwatch.com",
    "kamalwatch.com",
    "justintime.in",
    "casiostore.bhawar.com",
    "watchfactory.in",
    "avikya.in",
)

#: Which shop gets asked first, per brand.
#:
#: find_product returns the first host that carries the reference, so this decides
#: which page is *read*, not whether a match exists. Two things earn a place at the
#: front. Provenance: casiostore.bhawar.com is Casio India's own store, so it
#: answers for Casio ahead of any competitor. And legible specifications:
#: rameshwatch.com is the only one of the six whose product pages server-render a
#: specification table — a median of 15 facts against nought for kamalwatch across
#: 574 pages, nought for justintime across 279, and nought on 77 of 81 titanworld
#: pages. Reading the same watch from rameshwatch instead is the difference between
#: a listing with one specification and a listing with eight.
PREFERRED_RETAILERS: dict[str, tuple[str, ...]] = {
    "CASIO": ("casiostore.bhawar.com", "rameshwatch.com"),
    "TITAN": ("rameshwatch.com",),
    "FASTRACK": ("rameshwatch.com",),
    "SONATA": ("rameshwatch.com",),
}


#: Brand-owned shops that answer *after* the trade rather than before it.
#:
#: The maker is normally the better source, which is why brand hosts lead. Titan's
#: is the exception: titanworld.com is its export store, and it publishes a
#: thousand products of a far larger range, in dollars, with the specification
#: table rendered in the browser rather than in the page — 77 of 81 of its pages
#: yield no facts at all. It stays in the walk because its photography is Titan's
#: own; it simply stops being the first answer.
LAST_RESORT_HOSTS = frozenset({"titanworld.com"})


def retailer_hosts(brand: str) -> list[str]:
    """RETAILER_FEEDS, with the shops that answer this brand best moved to the front."""
    preferred = PREFERRED_RETAILERS.get(brand.strip().upper(), ())
    return [*preferred, *(h for h in RETAILER_FEEDS if h not in preferred)]


def walk_order(brand: str, brand_hosts: list[str]) -> list[str]:
    """The order the shops are asked in: the maker, then the trade, then the rest.

    Deduplicated, because a brand's own host is sometimes also a retailer feed and
    loading the same catalogue twice is a wasted request on every watch.
    """
    ordered = [
        *(h for h in brand_hosts if h not in LAST_RESORT_HOSTS),
        *retailer_hosts(brand),
        *(h for h in brand_hosts if h in LAST_RESORT_HOSTS),
    ]
    seen: set[str] = set()
    return [h for h in ordered if not (h in seen or seen.add(h))]


@dataclass(frozen=True)
class StoreProduct:
    """One product as the brand's own shop describes it."""

    url: str
    title: str
    handle: str
    #: Every reference-shaped token the shop exposes, for matching.
    tokens: frozenset[str]
    #: The product's own photographs, in the order the shop shows them.
    images: tuple[str, ...]
    #: The token subset from the title, handle and SKU — the fields that name the
    #: watch rather than file it. Counted to tell one watch from a whole range.
    identifying: frozenset[str] = frozenset()
    #: What this shop charges, in rupees. None when the feed omits it or quotes
    #: nonsense — Titan's feed reports a median of ₹4 across its whole catalogue.
    price: float | None = None
    #: The shop's struck-through figure, where it publishes one.
    list_price: float | None = None
    #: Everything the record says about who made it — vendor, title, tags.
    brand_blob: str = ""


def _reference_shaped(blob: str) -> frozenset[str]:
    # 4 to 16 characters, and at least one digit: "CHRONOGRAPH" is not a reference,
    # "A4B009X1" and "90110SM01" are.
    found = re.findall(r"\b[A-Z0-9][A-Z0-9\-]{3,15}\b", blob.upper())
    return frozenset(t for t in found if any(c.isdigit() for c in t))


def _tokens(product: dict[str, Any]) -> tuple[frozenset[str], frozenset[str]]:
    """Reference-shaped tokens from the fields a shop actually fills in.

    Returns (all, identifying). Both are matched against; only the identifying
    set is counted when deciding whether an entry describes one watch, because
    tags are where shops keep their own housekeeping. Casio India's own store
    tags products `100PGP`, `6MEW`, `FSI24H`, `SEO220825` — all reference-shaped,
    none references — and counting those as model numbers made 61% of its
    catalogue look like collection pages and dropped it out of the walk.

    SKU is identifying because it is the field that holds a real model number —
    Titan's feed puts `90110SM01` there while the title carries only marketing prose.
    """
    parts = [product.get("title") or "", product.get("handle") or ""]
    for variant in product.get("variants") or []:
        if variant.get("sku"):
            parts.append(str(variant["sku"]))

    identifying = _reference_shaped(" ".join(parts))
    tags = _reference_shaped(" ".join(str(tag) for tag in (product.get("tags") or [])))
    return identifying | tags, identifying


def _normalise(reference: str) -> str:
    """Strip the punctuation shops disagree about, so AT2604-56X == AT260456X."""
    return re.sub(r"[^A-Z0-9]", "", reference.upper())


async def load_catalogue(host: str, http: HttpClient, cache: Cache) -> list[StoreProduct] | None:
    """The brand's whole catalogue, or None when the shop does not publish one.

    A negative result is cached too: re-probing a non-Shopify host on every watch
    would cost a request each time and always fail.
    """
    cached = cache.get_json("storefront", host, CATALOGUE_TTL_S)
    if cached is not None:
        if not cached.get("shopify"):
            return None
        rupees = host not in FOREIGN_PRICE_HOSTS
        return [
            StoreProduct(
                url=p["url"], title=p["title"], handle=p["handle"],
                tokens=frozenset(p["tokens"]),
                # Older cache entries predate the split; falling back to the whole
                # set restores the previous behaviour rather than counting zero.
                identifying=frozenset(p.get("identifying") or p["tokens"]),
                images=tuple(p.get("images") or []),
                price=p.get("price") if rupees else None,
                list_price=p.get("listPrice") if rupees else None,
                brand_blob=p.get("brandBlob") or "",
            )
            for p in cached.get("products", [])
        ]

    products: list[StoreProduct] = []
    complete = False
    for page in range(1, MAX_PAGES + 1):
        url = f"https://{host}/products.json?limit={PAGE_SIZE}&page={page}"
        payload = await http.get_json(url)
        if not isinstance(payload, dict):
            # A refused, rate-limited or timed-out page reads exactly like the end
            # of the catalogue. Caching what we have as complete would pin a
            # truncated shop in place for a day, so the partial result is used for
            # this run and nothing is written.
            break
        batch = payload.get("products") or []
        if not batch:
            complete = True
            break
        rupees = host not in FOREIGN_PRICE_HOSTS
        for item in batch:
            handle = item.get("handle") or ""
            if not handle:
                continue
            variants = item.get("variants") or []
            first = variants[0] if variants else {}
            all_tokens, identifying = _tokens(item)
            products.append(
                StoreProduct(
                    url=f"https://{host}/products/{handle}",
                    title=item.get("title") or "",
                    handle=handle,
                    tokens=all_tokens,
                    identifying=identifying,
                    images=tuple(
                        img["src"] for img in (item.get("images") or []) if img.get("src")
                    ),
                    price=_price(first.get("price")) if rupees else None,
                    list_price=_price(first.get("compare_at_price")) if rupees else None,
                    brand_blob=" ".join(
                        [item.get("vendor") or "", item.get("title") or "", item.get("handle") or "",
                         " ".join(str(t) for t in (item.get("tags") or []))]
                    ).upper(),
                )
            )
        if len(batch) < PAGE_SIZE:
            complete = True
            break

    if not complete and products:
        # Usable now, not trusted tomorrow.
        return products

    cache.set_json(
        "storefront",
        host,
        {
            "shopify": bool(products),
            "products": [
                {"url": p.url, "title": p.title, "handle": p.handle,
                 "tokens": sorted(p.tokens), "identifying": sorted(p.identifying),
                 "images": list(p.images),
                 "price": p.price, "listPrice": p.list_price, "brandBlob": p.brand_blob}
                for p in products
            ],
        },
    )
    return products or None


#: A feed entry carrying more than this many references, or this many photographs,
#: is a collection page rather than one watch. Britime publishes several: 36 feed
#: entries appeared to cover 21 of the shop's 22 references, because one entry
#: listing "54 photographs" carried every reference in the range. Each match then
#: sent the agent to a page describing a different watch — caught by the grounding
#: every time, but only after it had been paid for.
MAX_REFERENCES_PER_PRODUCT = 4
MAX_IMAGES_PER_PRODUCT = 15

#: A watch below this is a strap, a battery or a broken feed field; above it, a
#: currency mix-up. Measured across four feeds: Alba ranges ₹7,500–20,000, Seiko
#: ₹30,000–350,000, Kamal Watch ₹1,795–789,900 — all believable — while Titan
#: reports a median of ₹4 for its entire catalogue and must be discarded.
MIN_PRICE = 300.0
MAX_PRICE = 5_000_000.0

#: Storefronts whose feed quotes a currency other than rupees.
#:
#: titanworld.com is Titan's *export* store — its records identify as
#: titan-malaysia.myshopify.com, country AE, currency USD — and a Shopify feed
#: does not say so anywhere in the product record. Read as rupees, its $1,435
#: automatic becomes a ₹1,435 listing: a plausible-looking figure, off by a
#: hundredfold, on the shop's own price tag. Its photographs and specifications
#: are still Titan's, so the host stays in the walk; only its money is refused.
#:
#: This is also the ₹4 median that MIN_PRICE was written to discard — the feed
#: quotes presentment amounts, and the discard was treating a symptom.
FOREIGN_PRICE_HOSTS = frozenset({"titanworld.com"})


def _price(value: Any) -> float | None:
    """A believable rupee figure, or None."""
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return None
    return amount if MIN_PRICE <= amount <= MAX_PRICE else None


def is_single_product(product: StoreProduct) -> bool:
    """Does this feed entry describe one watch, or a whole range?

    Counted on the identifying tokens only. A range page names every watch in it
    in its own title and handle; a single watch tagged with a shop's filing codes
    does not, and counting those rejected most of Casio India's own catalogue.
    """
    return (
        len(product.identifying or product.tokens) <= MAX_REFERENCES_PER_PRODUCT
        and len(product.images) <= MAX_IMAGES_PER_PRODUCT
    )


def _same_brand(product: StoreProduct, brand: str) -> bool:
    """Does this record claim the maker the shop says it is?

    A reference alone is not identity. The shop lists Casio under codes like
    A1290, and A1290 is also an Adriatica reference — matching on the token alone
    put an Adriatica watch on a Casio listing. One word of the brand appearing in
    the vendor, title or tags is enough, and cheap to require.
    """
    if not brand:
        return True
    blob = product.brand_blob or product.title.upper()
    words = [w for w in re.split(r"[^A-Z0-9]+", brand.upper()) if len(w) > 2]
    return any(word in blob for word in words) if words else True


#: A reference this long carries enough of itself to survive a shop's spelling of
#: it. Below it, loosening the comparison is how A1149 matches everything.
VARIANT_SAFE_LENGTH = 7


def _is_variant(token: str, wanted: str) -> bool:
    """Is this the same reference under a shop's own spelling?

    Titan sells one watch under several: the shop's sheet says `1737BM02` and
    kamalwatch lists `NN1737BM02`; `1697SL01` is `NK1697SL01` at watchfactory.
    Two letters in front, or one behind (`2776WM01` / `2776WM01F`), and the rest
    identical. 54 of the 150 Titan references that no feed appeared to carry are
    reachable this way, and every one was checked by eye to be the same watch.

    Deliberately narrow. Anything looser — a prefix test, an edit distance — puts
    a neighbouring watch on the listing, which is the failure this module exists
    to prevent.
    """
    if len(wanted) < VARIANT_SAFE_LENGTH:
        return False
    if len(token) == len(wanted) + 2 and token[2:] == wanted and token[:2].isalpha():
        return True
    return len(token) == len(wanted) + 1 and token[:-1] == wanted and token[-1].isalpha()


def match(products: list[StoreProduct], reference: str, brand: str = "") -> StoreProduct | None:
    """The product whose own fields carry this reference, if any.

    Exact on the normalised token, from an entry describing a single watch, and
    made by the brand the shop named. A near-match, a collection page, or another
    maker's watch sharing the reference is how the wrong watch gets listed — which
    is what this whole module exists to stop.

    Exact matches are taken across the whole catalogue before any variant spelling
    is considered, so a shop that carries both never answers with the variant.
    Among equals, one with photographs wins: a feed entry with an empty gallery
    ends the search having answered nothing, and the next shop along usually has
    the picture.
    """
    wanted = _normalise(reference)
    if len(wanted) < 4:
        return None

    eligible = [p for p in products if is_single_product(p) and _same_brand(p, brand)]

    def rank(product: StoreProduct, test) -> tuple[int, int]:
        """Better first: named by the reference, then carrying photographs.

        A shop tags a watch with its neighbours' references — "goes with", "same
        range" — so a token match alone can land on a sibling. The entry whose own
        title, handle or SKU carries the reference is the watch; one that only
        mentions it in a tag is a cross-reference and must never outrank it.
        """
        names_it = any(test(_normalise(t)) for t in (product.identifying or product.tokens))
        return (0 if names_it else 1, 0 if product.images else 1)

    for test in (
        lambda token: token == wanted,
        lambda token: _is_variant(token, wanted),
    ):
        hits = [p for p in eligible if any(test(_normalise(t)) for t in p.tokens)]
        if hits:
            # Sorted, not "first match": several entries can satisfy the variant
            # rule, and letting the shop's publication order decide which one wins
            # makes the price and the photographs on the listing arbitrary. The
            # handle is the tie-break so the same feed always gives the same answer.
            return sorted(hits, key=lambda p: (*rank(p, test), p.handle))[0]
    return None


#: Below this a reference is too short to identify a watch on the open web.
#: The shop's sheet lists Casio as A1149, A1176, A1201 — internal codes, four or
#: five characters. Searching them found anker.com for A1248 and an Adriatica
#: watch for A1290. The real reference is LTP-V300L-1AUDF.
SHORT_REFERENCE = 6

#: Tokens shaped like references that are really shop metadata.
_NOT_A_REFERENCE = re.compile(r"^(INR|RS|USD|EUR)[\d]|^\d+(MM|BAR|ATM|CM|G)$|^(19|20)\d\d$")


def resolve_reference(product: StoreProduct, shop_code: str) -> str | None:
    """The manufacturer's reference for a watch the shop lists under its own code.

    Retailers index both: kamalwatch's page for the shop's A1149 is
    `/products/a1149-ltp-v300l-1audf-enticer`, carrying the shop's code and the
    real reference together. Taking the longest other reference-shaped token off
    that record turns an unsearchable internal code into one that identifies the
    watch everywhere else.

    Only ever read from a storefront the agent already trusts — a brand's own shop
    or a named retailer — never from an open search result, because a four-letter
    code matches almost anything and that is the whole problem being solved.
    """
    wanted = _normalise(shop_code)
    # Only a code too short to be a real reference needs translating. A4B009X1 is
    # already the manufacturer's, and asking for a "better" one picked Alba's
    # price-band tag INR7100-10000 off the same record.
    if len(wanted) >= SHORT_REFERENCE:
        return None

    others = [
        token for token in product.tokens
        if _normalise(token) != wanted
        and len(_normalise(token)) >= SHORT_REFERENCE
        # "WATCH-A1045" is the shop's own code with a word stuck to it, not the
        # manufacturer's reference. A real one does not contain the internal code.
        and wanted not in _normalise(token)
        # Shops tag products with price bands and sizes. "INR10100" and "40MM"
        # are shaped like references and are not references.
        and not _NOT_A_REFERENCE.match(token.upper())
        # A reference carries letters as well as digits; a bare number is a price,
        # a year or a case size.
        and any(c.isalpha() for c in token)
    ]
    if not others:
        return None
    # The longest is the manufacturer's: shop codes are short by nature, and a
    # real reference carries its case, movement and colour variant in the suffix.
    return max(others, key=lambda t: len(_normalise(t)))


async def find_prices(
    hosts: list[str],
    reference: str,
    http: HttpClient,
    cache: Cache,
    brand: str = "",
) -> tuple[float | None, list[str]]:
    """What the trade is charging for this reference, agreed across sources.

    Every feed that carries the reference is asked, and the median is taken rather
    than the first answer. One shop's feed being wrong is common — Titan's quotes
    ₹4 for everything — and a median over two or three sources survives that where
    trusting the first hit would not. With a single source the figure is simply
    that source's, which is why the listing is flagged for a human either way.

    Returns (price, sources). Price is None when nothing believable was found.
    """
    found: list[float] = []
    seen: list[str] = []
    for host in hosts:
        try:
            products = await load_catalogue(host, http, cache)
        except Exception:  # noqa: BLE001
            continue
        if not products:
            continue
        hit = match(products, reference, brand)
        if hit and hit.price is not None:
            found.append(hit.price)
            seen.append(host)

    if not found:
        return None, []
    found.sort()
    median = found[len(found) // 2] if len(found) % 2 else (found[len(found) // 2 - 1] + found[len(found) // 2]) / 2
    return round(median, 2), seen


async def find_product(
    brand_hosts: list[str],
    reference: str,
    http: HttpClient,
    cache: Cache,
    brand: str = "",
) -> tuple[StoreProduct | None, str]:
    """Resolves a reference to its product on the brand's own shop.

    Returns (product, note). The note is shown to the shop so a run reads as an
    explanation rather than a spinner.

    The product's images matter as much as its URL. Scraping the page for pictures
    picks up the site banner and the "you may also like" carousel — on Alba's own
    A4B007X1 page that produced a 1920x1040 banner and a photograph of A4B003X1,
    a different watch. The feed lists the product's own gallery and nothing else.
    """
    fallback: tuple[StoreProduct, str] | None = None

    for host in brand_hosts:
        try:
            products = await load_catalogue(host, http, cache)
        except Exception:  # noqa: BLE001 - a broken storefront falls back to search
            continue
        if not products:
            continue
        hit = match(products, reference, brand)
        if not hit:
            continue
        note = f"found on {host} ({len(products)} indexed, {len(hit.images)} photographs)"
        if hit.images:
            return hit, note
        # A record with an empty gallery is a real identification — it resolves the
        # reference and names the watch — but it cannot illustrate the listing, and
        # stopping here was leaving watches pictureless while the next shop along
        # had the photographs. Keep it and carry on looking.
        fallback = fallback or (hit, note)

    return fallback or (None, "")
