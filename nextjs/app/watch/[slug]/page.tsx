import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Cursor from "@/components/Cursor";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Gallery from "@/components/Gallery";
import CatalogCard from "@/components/CatalogCard";
import { getProduct, getCatalogIndex, getBackdrops, COLLECTION_META } from "@/lib/catalog";
import { formatInr } from "@/agent/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "Not found — Prakash Watch Co." };

  return {
    title: product.copy.seoTitle || `${product.title} — Prakash Watch Co.`,
    description: product.copy.seoDescription || product.copy.short,
    openGraph: {
      title: product.copy.seoTitle || product.title,
      description: product.copy.seoDescription || product.copy.short,
      images: product.images[0] ? [{ url: product.images[0].url }] : undefined,
    },
  };
}

export default async function WatchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);

  // Unreviewed listings are not public; they live in the admin panel until approved.
  if (!product || product.status !== "ready") notFound();

  const backdrops = await getBackdrops();
  const backdrop = product.backdropId ? backdrops.get(product.backdropId) : undefined;

  const related = (await getCatalogIndex())
    .filter((entry) => entry.status === "ready" && entry.sku !== product.sku && entry.collection === product.collection)
    .slice(0, 3);

  const enquirySubject = encodeURIComponent(`Enquiry — ${product.title} (${product.modelNumber})`);
  const family = product.collection ? COLLECTION_META[product.collection] : null;

  return (
    <main style={{ position: "relative", minHeight: "100vh", background: "var(--bg)", overflow: "hidden" }}>
      <div className="grain" />
      <Cursor />
      <Nav />

      <div style={{ padding: "150px 44px 0" }}>
        <Link href="/collections" data-hover className="mono" style={{ fontSize: 10.5, letterSpacing: "0.2em", color: "var(--faint)", textTransform: "uppercase" }}>
          ← Collection
        </Link>
      </div>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, 46fr) minmax(320px, 54fr)",
          gap: 62,
          padding: "38px 44px 110px",
          alignItems: "start",
        }}
      >
        <div style={{ position: "sticky", top: 120 }}>
          <Gallery images={product.images} title={product.title} backdrop={backdrop} />
        </div>

        <div>
          <span className="kicker">{product.brand}</span>
          <h1
            className="h2"
            style={{ fontSize: "clamp(34px, 4.2vw, 66px)", marginTop: 14 }}
          >
            {product.modelName ?? product.modelNumber}
          </h1>

          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 22, flexWrap: "wrap" }}>
            <span style={{ fontSize: 26 }}>
              {product.price.selling === null ? "Price on request" : formatInr(product.price.selling)}
            </span>
            {product.price.mrp ? (
              <span className="mono" style={{ fontSize: 13, color: "var(--faint)", textDecoration: "line-through" }}>
                {formatInr(product.price.mrp)}
              </span>
            ) : null}
            {product.price.discountPct ? (
              <span className="mono" style={{ fontSize: 10.5, letterSpacing: "0.18em", color: "var(--accent)" }}>
                −{product.price.discountPct}%
              </span>
            ) : null}
            <span
              className="mono"
              style={{ fontSize: 10.5, letterSpacing: "0.18em", color: product.inStock ? "var(--accent)" : "var(--dim)" }}
            >
              {product.inStock ? "IN STOCK" : "SOLD OUT"}
            </span>
          </div>

          <p style={{ margin: "26px 0 0", fontSize: 16.5, lineHeight: 1.75, fontWeight: 300, color: "var(--body)" }}>
            {product.copy.short}
          </p>

          {product.copy.bullets.length > 0 && (
            <ul style={{ margin: "26px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 11 }}>
              {product.copy.bullets.map((bullet) => (
                <li key={bullet} style={{ display: "flex", gap: 13, fontSize: 14.5, fontWeight: 300, color: "var(--muted)" }}>
                  <span style={{ color: "var(--accent)" }} aria-hidden>—</span>
                  {bullet}
                </li>
              ))}
            </ul>
          )}

          <div style={{ display: "flex", gap: 13, marginTop: 38, flexWrap: "wrap" }}>
            <a href="tel:+919899645897" data-hover className="btn btn-solid">
              Call the boutique
            </a>
            <a
              href={`mailto:prakashwatchco@gmail.com?subject=${enquirySubject}`}
              data-hover
              className="btn btn-ghost"
            >
              Reserve to try on
            </a>
          </div>

          {/* The spec sheet, sectioned the way a brand's own product page reads,
              with every line still traceable to the source it was quoted from. */}
          {product.specs.length > 0 && (
            <div style={{ marginTop: 58 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <span className="kicker">Specification</span>
                <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.16em", color: "var(--faint)" }}>
                  {product.specs.length} CONFIRMED
                </span>
              </div>

              {Object.entries(
                product.specs.reduce<Record<string, typeof product.specs>>((sections, spec) => {
                  (sections[spec.group] ??= []).push(spec);
                  return sections;
                }, {}),
              ).map(([section, specs]) => (
                <div key={section} style={{ marginTop: 26 }}>
                  <h3
                    className="serif"
                    style={{ margin: "0 0 2px", fontSize: 21, fontWeight: 400, color: "var(--text)" }}
                  >
                    {section}
                  </h3>
                  <dl style={{ margin: 0, borderTop: "1px solid var(--line)" }}>
                    {specs.map((spec) => {
                      const source = spec.sourceIndex === null ? null : product.sources[spec.sourceIndex];
                      return (
                        <div
                          key={`${spec.label}-${spec.value}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "160px 1fr auto",
                            gap: 18,
                            alignItems: "baseline",
                            padding: "13px 4px",
                            borderBottom: "1px solid var(--line)",
                          }}
                        >
                          <dt
                            className="mono"
                            style={{ fontSize: 10, letterSpacing: "0.16em", color: "var(--faint)", textTransform: "uppercase" }}
                          >
                            {spec.label}
                          </dt>
                          <dd style={{ margin: 0, fontSize: 14.5, fontWeight: 300, color: "var(--body)" }}>
                            {spec.value}
                          </dd>
                          {source ? (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer nofollow"
                              className="mono"
                              title={`Stated by ${source.publisher}`}
                              style={{ fontSize: 9, letterSpacing: "0.12em", color: "var(--faint)" }}
                            >
                              {source.publisher}
                            </a>
                          ) : (
                            <span />
                          )}
                        </div>
                      );
                    })}
                  </dl>
                </div>
              ))}
            </div>
          )}

          {product.copy.long && (
            <div style={{ marginTop: 50 }}>
              <span className="kicker">In the hand</span>
              {product.copy.long.split(/\n\s*\n/).map((paragraph) => (
                <p key={paragraph.slice(0, 40)} style={{ margin: "18px 0 0", fontSize: 15.5, lineHeight: 1.8, fontWeight: 300, color: "var(--muted)" }}>
                  {paragraph}
                </p>
              ))}
            </div>
          )}

          <p className="mono" style={{ marginTop: 46, fontSize: 10, lineHeight: 1.9, letterSpacing: "0.1em", color: "var(--faint)", textTransform: "uppercase" }}>
            Reference {product.modelNumber}
            {family ? ` · ${family.name}` : ""}
            {product.gender ? ` · ${product.gender}` : ""}
            <br />
            Specifications compiled from the sources linked above and checked in store. Confirm before purchase.
          </p>
        </div>
      </section>

      {related.length > 0 && (
        <section style={{ padding: "0 44px 130px" }}>
          <span className="kicker">Also in {family?.name ?? "the collection"}</span>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
              gap: 22,
              marginTop: 28,
            }}
          >
            {related.map((entry) => (
              <CatalogCard
                key={entry.sku}
                entry={entry}
                backdrop={entry.backdropId ? backdrops.get(entry.backdropId) : undefined}
              />
            ))}
          </div>
        </section>
      )}

      <Footer />
    </main>
  );
}
