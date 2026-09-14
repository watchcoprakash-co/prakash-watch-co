import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import Cursor from "@/components/Cursor";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { getBrands } from "@/lib/brands";
import { getBackdrops } from "@/lib/catalog";
import { formatInr } from "@/agent/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Brands — Prakash Watch Co.",
  description:
    "Every house Prakash Watch Co. is authorised to sell, with what is on the shelf today. Sized, set and warranted in store across Delhi NCR since 1976.",
};

export default async function BrandsPage() {
  const [brands, backdrops] = await Promise.all([getBrands(), getBackdrops()]);
  const total = brands.reduce((sum, brand) => sum + brand.inStock, 0);

  return (
    <main style={{ position: "relative", minHeight: "100vh", background: "var(--bg)", overflow: "hidden" }}>
      <div className="grain" />
      <Cursor />
      <Nav />

      <section style={{ padding: "160px 44px 40px" }}>
        <span className="kicker">02 — The houses</span>
        <h1 className="h2" style={{ fontSize: "clamp(36px, 4.6vw, 72px)", maxWidth: 900 }}>
          Brands we are<br />
          <span className="italic-accent">authorised</span> to sell
        </h1>
        <p style={{ maxWidth: 540, margin: "22px 0 0", fontSize: 15, lineHeight: 1.7, fontWeight: 300, color: "var(--muted)" }}>
          {total > 0
            ? `${total} piece${total === 1 ? "" : "s"} on the shelf across ${brands.length} house${brands.length === 1 ? "" : "s"}. `
            : ""}
          Every watch carries the maker&rsquo;s own warranty card, stamped in store — and is serviced by the people
          who sold it to you.
        </p>
      </section>

      <section style={{ padding: "0 44px 120px" }}>
        {brands.length === 0 ? (
          <div style={{ border: "1px solid var(--line)", background: "var(--card)", padding: "70px 40px", textAlign: "center" }}>
            <p className="serif" style={{ fontSize: 26, margin: 0 }}>
              Nothing listed here yet.
            </p>
            <p style={{ margin: "14px 0 0", fontSize: 14.5, fontWeight: 300, color: "var(--muted)" }}>
              Stock is added from the shop&apos;s inventory sheet.
            </p>
          </div>
        ) : (
          <div style={{ borderTop: "1px solid var(--line)" }}>
            {brands.map((brand, i) => {
              const backdrop = brand.backdropId ? backdrops.get(brand.backdropId) : undefined;
              return (
                <Link
                  key={brand.slug}
                  href={`/brands/${brand.slug}`}
                  className="row hover-card brand-row"
                  data-hover
                  style={{
                    padding: "26px 8px",
                    borderBottom: "1px solid var(--line)",
                    transition: "background-color .4s, padding-left .4s",
                  }}
                >
                  <span
                    className="brand-row-mark"
                    style={{
                      position: "relative",
                      display: "grid",
                      placeItems: "center",
                      width: 112,
                      height: 112,
                      borderRadius: "50%",
                      overflow: "hidden",
                      background: backdrop?.css ?? "var(--card-hover)",
                      border: "1px solid var(--line2)",
                    }}
                  >
                    {brand.image ? (
                      <Image src={brand.image} alt="" fill sizes="112px" style={{ objectFit: "contain", padding: 16 }} />
                    ) : (
                      <span className="mono" style={{ fontSize: 9, letterSpacing: "0.2em", color: "var(--faint)" }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    )}
                  </span>

                  <div className="brand-row-name" style={{ minWidth: 0 }}>
                    <span className="serif" style={{ display: "block", fontSize: "clamp(26px, 3vw, 44px)", lineHeight: 1.05, letterSpacing: "-0.01em" }}>
                      {brand.name}
                    </span>
                    {brand.since !== null && (
                      <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--faint)" }}>
                        House since {brand.since}
                      </span>
                    )}
                  </div>

                  <span className="brand-row-note" style={{ fontSize: 14.5, fontWeight: 300, lineHeight: 1.6, color: "var(--muted)" }}>
                    {brand.tagline ?? `${brand.count} reference${brand.count === 1 ? "" : "s"} catalogued.`}
                  </span>

                  <span className="brand-row-stock" style={{ justifySelf: "end", textAlign: "right" }}>
                    <span
                      className="mono"
                      style={{
                        display: "block",
                        fontSize: 11,
                        letterSpacing: "0.18em",
                        color: brand.inStock > 0 ? "var(--accent)" : "var(--faint)",
                      }}
                    >
                      {brand.inStock > 0 ? `${brand.inStock} IN STOCK` : "ASK IN STORE"}
                    </span>
                    {brand.priceFrom !== null && (
                      <span className="mono" style={{ display: "block", marginTop: 7, fontSize: 10, letterSpacing: "0.14em", color: "var(--faint)" }}>
                        FROM {formatInr(brand.priceFrom)}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        <p style={{ margin: "40px 0 0", fontSize: 14.5, fontWeight: 300, color: "var(--muted)" }}>
          Looking for a house we do not list?{" "}
          <a href="tel:+919899645897" style={{ color: "var(--accent-soft)" }}>
            Call the shop
          </a>{" "}
          — much of what we can source never reaches the window.
        </p>
      </section>

      <Footer />
    </main>
  );
}
