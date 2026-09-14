import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Cursor from "@/components/Cursor";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import CatalogCard from "@/components/CatalogCard";
import FilterSidebar from "@/components/shop/FilterSidebar";
import ActiveFilters from "@/components/shop/ActiveFilters";
import SearchBar from "@/components/shop/SearchBar";
import SortSelect from "@/components/shop/SortSelect";
import { getCatalogIndex, getBackdrops, PUBLISHED_STATUS } from "@/lib/catalog";
import { applyFilters, parseFilters, sortEntries } from "@/lib/filters";
import { getBrand, getBrands, brandSlug } from "@/lib/brands";
import { formatInr } from "@/agent/format";
import { isPriced } from "@/agent/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const brand = await getBrand((await params).slug);
  if (!brand) return { title: "Brand not found — Prakash Watch Co." };

  return {
    title: `${brand.name} — Prakash Watch Co.`,
    description:
      brand.blurb ??
      `Every ${brand.name} reference in stock at Prakash Watch Co., sized, set and warranted in store. Authorised dealer across Delhi NCR since 1976.`,
  };
}

export default async function BrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const brand = await getBrand(slug);
  if (!brand) notFound();

  const state = parseFilters(await searchParams);

  const [index, backdrops, allBrands] = await Promise.all([getCatalogIndex(), getBackdrops(), getBrands()]);

  // The grid is scoped to this brand before any filter runs, so the sidebar's
  // counts describe this shelf rather than the whole shop.
  const published = index.filter(
    (entry) => entry.status === PUBLISHED_STATUS && brandSlug(entry.brand) === brand.slug,
  );
  const matched = sortEntries(applyFilters(published, state), state.sort);

  // Priced watches only: an unpriced one lists at "price on request" and belongs
  // in no price range.
  const prices = published.filter(isPriced).map((entry) => entry.price.selling);
  const bounds = {
    low: prices.length ? Math.floor(Math.min(...prices)) : 0,
    high: prices.length ? Math.ceil(Math.max(...prices)) : 0,
  };

  const others = allBrands.filter((other) => other.slug !== brand.slug);

  return (
    <main style={{ position: "relative", minHeight: "100vh", background: "var(--bg)", overflow: "hidden" }}>
      <div className="grain" />
      <Cursor />
      <Nav />

      <section style={{ padding: "150px 44px 30px" }}>
        <nav
          className="mono"
          style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 26 }}
          aria-label="Breadcrumb"
        >
          <Link href="/brands" style={{ color: "var(--dim)" }}>
            Brands
          </Link>
          <span style={{ margin: "0 10px" }}>/</span>
          <span style={{ color: "var(--body)" }}>{brand.name}</span>
        </nav>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 44, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 640 }}>
            <h1 className="h2" style={{ fontSize: "clamp(42px, 6vw, 92px)", margin: 0 }}>
              {brand.name}
            </h1>
            {brand.tagline && (
              <p className="serif" style={{ margin: "16px 0 0", fontSize: "clamp(19px, 2vw, 26px)", lineHeight: 1.25, color: "var(--accent-soft)", fontStyle: "italic" }}>
                {brand.tagline}
              </p>
            )}
            {brand.blurb && (
              <p style={{ maxWidth: 560, margin: "24px 0 0", fontSize: 15, lineHeight: 1.75, fontWeight: 300, color: "var(--muted)" }}>
                {brand.blurb}
              </p>
            )}
          </div>

          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))",
              gap: 30,
              margin: 0,
              minWidth: 250,
              borderTop: "1px solid var(--line)",
              paddingTop: 22,
            }}
          >
            <Figure label="In stock" value={String(brand.inStock)} />
            <Figure label="References" value={String(brand.count)} />
            {brand.priceFrom !== null && (
              <Figure label="From" value={formatInr(brand.priceFrom)} accent />
            )}
            {brand.since !== null && <Figure label="House since" value={String(brand.since)} />}
          </dl>
        </div>
      </section>

      <div className="shop-layout">
        <Suspense fallback={<aside />}>
          <FilterSidebar entries={published} state={state} bounds={bounds} />
        </Suspense>

        <div>
          <div className="shop-toolbar">
            <Suspense fallback={<div style={{ flex: "1 1 260px" }} />}>
              <SearchBar initial={state.q} />
            </Suspense>
            <span className="mono" style={{ fontSize: 10, letterSpacing: "0.16em", color: "var(--faint)" }}>
              {matched.length} OF {published.length}
            </span>
            <div style={{ marginLeft: "auto" }}>
              <Suspense fallback={null}>
                <SortSelect value={state.sort} />
              </Suspense>
            </div>
          </div>

          <ActiveFilters state={state} />

          <div style={{ marginTop: 26 }}>
            {matched.length === 0 ? (
              <div style={{ border: "1px solid var(--line)", background: "var(--card)", padding: "70px 40px", textAlign: "center" }}>
                <p className="serif" style={{ fontSize: 26, margin: 0 }}>
                  No {brand.name} piece matches that.
                </p>
                <p style={{ margin: "14px 0 0", fontSize: 14.5, fontWeight: 300, color: "var(--muted)" }}>
                  Try removing a filter, or{" "}
                  <Link href={`/brands/${brand.slug}`} style={{ color: "var(--accent-soft)" }}>
                    see the whole {brand.name} shelf
                  </Link>
                  . We can also source references we do not stock.
                </p>
              </div>
            ) : (
              <div className="shop-grid">
                {matched.map((entry) => (
                  <CatalogCard
                    key={entry.sku}
                    entry={entry}
                    backdrop={entry.backdropId ? backdrops.get(entry.backdropId) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {others.length > 0 && (
        <section style={{ padding: "20px 44px 110px" }}>
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 34, display: "flex", alignItems: "baseline", gap: 30, flexWrap: "wrap" }}>
            <span className="kicker">Also on the shelf</span>
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              {others.map((other) => (
                <Link
                  key={other.slug}
                  href={`/brands/${other.slug}`}
                  className="serif"
                  data-hover
                  style={{ fontSize: 26, color: "var(--body)" }}
                >
                  {other.name}
                  <span className="mono" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--faint)", marginLeft: 10 }}>
                    {other.inStock}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </main>
  );
}

function Figure({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <dt className="mono" style={{ fontSize: 9.5, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--faint)" }}>
        {label}
      </dt>
      <dd
        className="serif"
        style={{ margin: "8px 0 0", fontSize: 30, lineHeight: 1, color: accent ? "var(--accent)" : "var(--text)" }}
      >
        {value}
      </dd>
    </div>
  );
}
