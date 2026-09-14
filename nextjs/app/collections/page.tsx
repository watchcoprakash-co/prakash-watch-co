import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import Cursor from "@/components/Cursor";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import CatalogCard from "@/components/CatalogCard";
import FilterSidebar from "@/components/shop/FilterSidebar";
import ActiveFilters from "@/components/shop/ActiveFilters";
import SearchBar from "@/components/shop/SearchBar";
import SortSelect from "@/components/shop/SortSelect";
import { getCatalogIndex, getBackdrops } from "@/lib/catalog";
import { applyFilters, parseFilters, sortEntries } from "@/lib/filters";
import { isPriced } from "@/agent/types";

// Artifacts change whenever the agent runs or an edit is saved.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Collection — Prakash Watch Co.",
  description:
    "Every reference in stock at Prakash Watch Co., sized, set and warranted in store. Authorised multi-brand boutiques across Delhi NCR since 1976.",
};

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const state = parseFilters(params);

  const [index, backdrops] = await Promise.all([getCatalogIndex(), getBackdrops()]);
  // Priced as well as ready: a brand master can be ingested with no prices, and an
  // unpriced watch has nothing to put on a card.
  const published = index.filter((entry) => entry.status === "ready");

  const matched = sortEntries(applyFilters(published, state), state.sort);

  // Bounds come from the whole catalogue, so the price field's placeholders stay
  // steady while filters narrow the results.
  // Bounds come from the priced watches only. A brand master carries no prices, so
  // those list at "price on request" and simply sit outside any price range.
  const prices = published.filter(isPriced).map((entry) => entry.price.selling);
  const bounds = {
    low: prices.length ? Math.floor(Math.min(...prices)) : 0,
    high: prices.length ? Math.ceil(Math.max(...prices)) : 0,
  };

  return (
    <main style={{ position: "relative", minHeight: "100vh", background: "var(--bg)", overflow: "hidden" }}>
      <div className="grain" />
      <Cursor />
      <Nav />

      <section style={{ padding: "160px 44px 34px" }}>
        <span className="kicker">01 — The Index</span>
        <h1 className="h2" style={{ fontSize: "clamp(36px, 4.6vw, 72px)", maxWidth: 900 }}>
          Every reference,<br />
          <span className="italic-accent">in stock</span>
        </h1>
        <p style={{ maxWidth: 520, margin: "22px 0 0", fontSize: 15, lineHeight: 1.7, fontWeight: 300, color: "var(--muted)" }}>
          Sized, set and warranted in store. Prices in rupees, inclusive of taxes. Ask for anything you cannot see
          here — much of the safe never reaches the window.
        </p>
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
                  {published.length === 0 ? "Nothing listed here yet." : "No watch matches that."}
                </p>
                <p style={{ margin: "14px 0 0", fontSize: 14.5, fontWeight: 300, color: "var(--muted)" }}>
                  {published.length === 0 ? (
                    <>
                      Stock is added from the shop&apos;s inventory sheet. Call{" "}
                      <a href="tel:+919899645897" style={{ color: "var(--accent-soft)" }}>
                        +91 98996 45897
                      </a>{" "}
                      and we will tell you what is in the safe.
                    </>
                  ) : (
                    <>
                      Try removing a filter, or{" "}
                      <Link href="/collections" style={{ color: "var(--accent-soft)" }}>
                        start again
                      </Link>
                      . We can also source references we do not stock.
                    </>
                  )}
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

      <Footer />
    </main>
  );
}
