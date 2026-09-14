"""Indian sources for Indian stock.

The shop sells the Indian market's references, at Indian prices, with Indian
warranty. A global page for the "same" watch is often a different reference
(EFR-539DE-8A abroad against EFR-539DE-8AV here), quotes dollars, and describes a
warranty the buyer will not get. So research is pointed at India: the brands'
Indian sites first, then India's authorised retailers and marketplaces.

The domains below were each checked by hand rather than assumed, because a good
share of Indian brand sites refuse automated readers outright. Those are recorded
as `blocks_bots` so the agent does not waste a request discovering it again:

    reachable   seikowatches.co.in · tissotwatches.com/en-in
    403 / dead  casio.com/in · titan.co.in · fastrack.in · sonatawatches.in
                citizenwatches.in · ethoswatches.com

Where a brand's own Indian site is closed to us, the authorised Indian retailers
carry the listing instead — which is the honest fallback, since that is where an
Indian buyer would see the same reference at the same price.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class BrandSite:
    """A brand's Indian presence."""

    #: Domains that count as this brand's own Indian site.
    domains: tuple[str, ...]
    #: Entry URLs, used to bias search and to recognise the brand's own pages.
    urls: tuple[str, ...] = ()
    #: Verified to refuse automated readers — worth knowing before we fetch.
    blocks_bots: bool = False
    #: Extra spellings the shop might type in the Brand column.
    aliases: tuple[str, ...] = field(default_factory=tuple)


#: Indian sites for the brands a Delhi multi-brand boutique actually carries.
BRANDS: dict[str, BrandSite] = {
    "casio": BrandSite(
        domains=("casio.com/in", "casioindiacompany.com"),
        urls=("https://www.casio.com/in/watches/",),
        blocks_bots=True,
        aliases=("g-shock", "gshock", "edifice", "casio edifice", "casio g-shock"),
    ),
    "seiko": BrandSite(
        domains=("seikowatches.co.in", "seikowatches.com", "seiko.co.in"),
        urls=("https://seikowatches.co.in/",),
    ),
    "titan": BrandSite(
        # Verified 2026-09-13. titanworld.com is NOT Titan's Indian site — it is the
        # export store (titan-malaysia.myshopify.com, country AE, prices in USD), and
        # treating it as the brand's own put dollar figures into a rupee catalogue.
        # titan.co.in is the real one and refuses automated readers, so Titan is read
        # from the trade instead; that is a true statement of the position, where the
        # old entry was a convenient one.
        domains=("titan.co.in",),
        urls=("https://www.titan.co.in/",),
        blocks_bots=True,
        aliases=("titan raga", "raga", "nebula", "titan edge"),
    ),
    "tissot": BrandSite(
        domains=("tissotwatches.com/en-in",),
        urls=("https://www.tissotwatches.com/en-in",),
    ),
    # Verified 2026-09-13: answers automated readers. The flag was wrong.
    "citizen": BrandSite(domains=("citizenwatches.in", "citizen.in")),
    "fastrack": BrandSite(domains=("fastrack.in",), blocks_bots=True),
    "sonata": BrandSite(domains=("sonatawatches.in",), blocks_bots=True),
    # Verified 2026-09-13. The storefront is the shop. subdomain; timexindia.com
    # alone is the brochure site.
    "timex": BrandSite(domains=("shop.timexindia.com", "timexindia.com")),
    # Verified 2026-09-13: refuses automated readers.
    "fossil": BrandSite(domains=("fossil.in",), blocks_bots=True),
    "rado": BrandSite(domains=("rado.com/en-in",)),
    "tag heuer": BrandSite(domains=("tagheuer.com/in",), aliases=("tagheuer", "tag")),
    "daniel wellington": BrandSite(domains=("danielwellington.com/in",), aliases=("dw",)),
    "garmin": BrandSite(domains=("garmin.co.in",)),
    "boat": BrandSite(domains=("boat-lifestyle.com",), aliases=("boat lifestyle",)),
    "noise": BrandSite(domains=("gonoise.com",)),
    "fire-boltt": BrandSite(domains=("fireboltt.com",), aliases=("fire boltt", "fireboltt")),
    # Verified 2026-09-13. Gc is a separate line from Guess and is not sold on
    # guess.in, which is why the registry's old entry matched nothing.
    "guess collection": BrandSite(
        domains=("guesswatches.com", "gcwatches.com"), aliases=("gc", "gc watches")
    ),
    "michael kors": BrandSite(
        # michaelkors.com is the US store; India is served from the .global locale.
        domains=("michaelkors.global/in/en", "michaelkors.global"),
        blocks_bots=True,
        aliases=("mk",),
    ),
    "alba": BrandSite(domains=("alba-watches.co.in",)),
    "alexandre christie": BrandSite(domains=("alexandrechristie.in",), aliases=("ac",)),
}

#: India's authorised watch retailers and the marketplaces the trade actually uses.
#: These carry Indian references at Indian prices, which is what matters here.
INDIA_RETAILERS: tuple[str, ...] = (
    "helioswatchstore.com",
    "ethoswatches.com",
    "kamalwatch.com",
    "justwatches.in",
    "titanworld.com",
    "watchesindia.com",
    "johnsonwatch.com",
    "zimsonwatches.com",
    "swisstimehouse.com",
    "kapoorwatch.com",
    "amazon.in",
    "flipkart.com",
    "tatacliq.com",
    "myntra.com",
    "ajio.com",
    "snapdeal.com",
    "reliancedigital.in",
    "croma.com",
    "nykaafashion.com",
    "shoppersstop.com",
)

#: Storefronts for other countries. They rank well for these references and are
#: exactly what must not be quoted: wrong currency, wrong variant, wrong warranty.
FOREIGN_MARKERS: tuple[str, ...] = (
    "amazon.com", "amazon.co.uk", "amazon.ae", "amazon.sg", "amazon.de", "amazon.ca",
    "ebay.com", "ebay.co.uk", "walmart.com", "target.com", "macys.com",
    "jomashop.com", "creationwatches.com", "watches2u.com", "watchshop.com",
    "chrono24.com", "rivolishop.com", "watchstation.com", "seikoboutique.com",
    "titanwatches.sg", "desertcart", "aliexpress", "lazada", "shopee",
    ".co.uk", ".com.au", ".co.nz", ".com.sg", ".ae/", ".sa/", ".my/",
)


#: Foreign marketplaces and cross-border resellers that must never become a source.
#:
#: These are the subset of FOREIGN_MARKERS that *sell*, as opposed to merely being
#: abroad. A foreign brand site is useful context; a foreign shop is not, because
#: what it lists is a different article — another market's variant of the
#: reference, at another market's price, in another currency, with the packaging
#: and warranty of somewhere else. Walmart supplied 24 sources for the Seiko wall
#: clocks and Amazon another 14, on listings meant for a Delhi shop.
#:
#: Kept separate from FOREIGN_MARKERS because that list also carries plain country
#: suffixes (".co.uk", ".com.au"), which should lower a page's rank, not ban it.
FOREIGN_SELLERS: tuple[str, ...] = (
    "amazon.com", "amazon.co.uk", "amazon.ae", "amazon.sg", "amazon.de", "amazon.ca",
    "amazon.com.au", "ebay.com", "ebay.co.uk", "walmart.com", "target.com",
    "macys.com", "jomashop.com", "creationwatches.com", "watches2u.com",
    "watchshop.com", "chrono24.com", "rivolishop.com", "watchstation.com",
    "seikoboutique.com", "desertcart", "aliexpress", "lazada", "shopee",
    "jumia.", "xcite.com", "noon.com",
)


#: Marketplaces barred wherever they trade, India included.
#:
#: Not because they are abroad — Amazon India and Flipkart are not — but because a
#: marketplace listing is written by whichever third-party seller happens to hold
#: the stock. The title is padded for search, the specification block is often
#: another variant's, and the photographs are frequently the wrong colourway. It
#: reads as authoritative and is not, and both rate-limit automated readers anyway.
#: Every other Indian site passes; this list is deliberately only these two.
BARRED_MARKETPLACES: tuple[str, ...] = ("amazon.", "flipkart.")


def is_foreign_seller(url: str) -> bool:
    """True for a source that must never be read: a shop abroad, or a marketplace.

    Two different reasons, one answer. A foreign shop sells a different article —
    another market's variant of the reference, in another currency, under another
    warranty. A marketplace sells the right article described by a stranger.
    """
    lowered = url.lower()
    if any(marker in lowered for marker in BARRED_MARKETPLACES):
        return True
    return any(marker in lowered for marker in FOREIGN_SELLERS)


def _norm(value: str) -> str:
    return value.strip().lower()


def brand_site(brand: str) -> BrandSite | None:
    """Finds a brand's Indian site by name or alias."""
    key = _norm(brand)
    if key in BRANDS:
        return BRANDS[key]
    for name, site in BRANDS.items():
        if key == name or key in site.aliases or any(alias in key for alias in site.aliases):
            return site
        if name in key:
            return site
    return None


def _split(url: str) -> tuple[str, str]:
    """Returns (host, path), lowercased, without www. or port."""
    lowered = url.lower().strip()
    without_scheme = lowered.split("//", 1)[1] if "//" in lowered else lowered
    host, _, rest = without_scheme.partition("/")
    return host.removeprefix("www.").split(":")[0], f"/{rest}"


def _matches_domain(host: str, path: str, domain: str) -> bool:
    """Matches a registry entry, which may be a bare host or a host + path prefix.

    Boundaries matter. Naive substring matching made casio.com/**intl** look like
    the Indian casio.com/**in**, and made every tissotwatches.com locale — /en-ca
    included — look Indian, because only the host was compared.
    """
    domain_host, _, domain_path = domain.lower().partition("/")
    domain_host = domain_host.removeprefix("www.")

    if host != domain_host and not host.endswith(f".{domain_host}"):
        return False
    if not domain_path:
        return True
    prefix = f"/{domain_path}"
    return path == prefix or path.startswith(f"{prefix}/") or path.startswith(f"{prefix}?")


def is_brand_site(url: str, brand: str) -> bool:
    """True when the URL is the brand's own Indian site — the Indian locale of it."""
    site = brand_site(brand)
    if not site:
        return False
    host, path = _split(url)
    return any(_matches_domain(host, path, domain) for domain in site.domains)


def is_indian_host(host: str) -> bool:
    """True for an Indian top-level domain or a known Indian retailer."""
    host = host.lower().removeprefix("www.")
    if host.endswith(".in"):
        return True
    return any(host == retailer or host.endswith(f".{retailer}") for retailer in INDIA_RETAILERS)


def is_indian_url(url: str, brand: str | None = None) -> bool:
    """True when a URL serves the Indian market."""
    lowered = url.lower()
    host, path = _split(url)

    # Cross-border resellers use .in domains while shipping from abroad at foreign
    # prices, so the exclusion list is consulted before the top-level domain.
    if any(marker in lowered for marker in FOREIGN_MARKERS):
        return False

    if brand and is_brand_site(url, brand):
        return True
    if is_indian_host(host):
        return True

    # Global brands serve India on a locale path rather than a domain.
    return any(path == marker.rstrip("/") or path.startswith(marker)
               for marker in ("/en-in/", "/in-en/", "/india/", "/in/"))


def blocks_bots(brand: str) -> bool:
    """Whether this brand's Indian site is known to refuse automated readers."""
    site = brand_site(brand)
    return bool(site and site.blocks_bots)


def india_search_hint(brand: str) -> str:
    """A domain token to steer search at the brand's Indian site, if it has one."""
    site = brand_site(brand)
    if not site or site.blocks_bots:
        # No point steering search at a site we will not be allowed to read.
        return ""
    return site.domains[0].split("/")[0] if site.domains else ""
