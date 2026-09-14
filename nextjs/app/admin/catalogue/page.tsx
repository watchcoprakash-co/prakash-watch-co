import Link from "next/link";
import Image from "next/image";
import UploadPanel from "@/components/admin/UploadPanel";
import RerunPanel from "@/components/admin/RerunPanel";
import { getAllProducts } from "@/lib/catalog";
import { Empty, PageHead, formatInr } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; flag?: string }>;
}) {
  const { status, flag } = await searchParams;
  const products = await getAllProducts();

  const shown = products.filter((product) => {
    if (flag) return product.review.flags.includes(flag as never);
    if (status === "review") return product.status !== "ready";
    if (status === "live") return product.status === "ready";
    return true;
  });

  // Anything needing a decision floats up; a list sorted by name buries the work.
  const ordered = [...shown].sort(
    (a, b) => Number(a.status === "ready") - Number(b.status === "ready") || a.brand.localeCompare(b.brand),
  );

  const live = products.filter((p) => p.status === "ready").length;

  return (
    <>
      <PageHead
        title="Catalogue"
        lead="Every listing the agent has produced. Upload a stock sheet and it researches, writes and photographs each watch, then holds it here for your approval."
      />

      <UploadPanel />

      <section style={{ border: "1px solid var(--line)", background: "var(--card)", padding: 20, margin: "var(--ops-4) 0" }}>
        <span className="ops-sublabel" style={{ marginTop: 0 }}>Research the review queue again</span>
        <p style={{ fontSize: 12.5, lineHeight: 1.6, fontWeight: 300, color: "var(--dim)", margin: "0 0 14px", maxWidth: 640 }}>
          Puts every listing currently held for review back through the pipeline. Worth doing after the agent has
          been improved — a watch that failed on an old run often succeeds on the new one. Prices and quantities
          you have typed are kept.
        </p>
        <RerunPanel mode="bulk" scope="review" count={products.filter((p) => p.status !== "ready").length} />
      </section>

      <nav aria-label="Filter listings" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "20px 0 12px" }}>
        <Link href="/admin/catalogue" className="ops-chip" data-tone={!status && !flag ? "good" : "mute"}>All {products.length}</Link>
        <Link href="/admin/catalogue?status=review" className="ops-chip" data-tone={status === "review" ? "warn" : "mute"}>
          Awaiting review {products.length - live}
        </Link>
        <Link href="/admin/catalogue?status=live" className="ops-chip" data-tone={status === "live" ? "good" : "mute"}>Live {live}</Link>
        <Link href="/admin/catalogue?flag=provisional-image" className="ops-chip" data-tone={flag === "provisional-image" ? "warn" : "mute"}>
          Unconfirmed photo {products.filter((p) => p.review.flags.includes("provisional-image")).length}
        </Link>
      </nav>

      {ordered.length === 0 ? (
        <Empty title="Nothing listed yet" body="Upload the shop's stock sheet above — brand, model number and price are all it needs." />
      ) : (
        <div className="ops-panel" style={{ padding: 0 }}>
          <table className="ops-table">
            <thead>
              <tr>
                <th style={{ width: 44 }} />
                <th>Watch</th><th>Held for</th>
                <th style={{ textAlign: "right" }}>Price</th>
                <th style={{ textAlign: "right" }}>Photos</th>
                <th style={{ textAlign: "right" }}>Specs</th>
                <th style={{ textAlign: "right" }}>Confidence</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((product) => (
                <tr key={product.sku}>
                  <td>
                    <span style={{ position: "relative", display: "block", width: 34, height: 34, background: "#100e0d", border: "1px solid var(--line)" }}>
                      {product.images[0] && (
                        <Image src={product.images[0].url} alt="" fill sizes="34px" style={{ objectFit: "contain", padding: 2 }} />
                      )}
                    </span>
                  </td>
                  <td>
                    <Link href={`/admin/review/${product.sku}`} style={{ color: "var(--text)" }}>{product.title}</Link>
                    <span className="mono" style={{ display: "block", fontSize: 9.5, color: "var(--faint)", marginTop: 2 }}>
                      {product.modelNumber.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {product.review.flags.slice(0, 2).map((f) => (
                        <span key={f} className="ops-chip" data-tone={f === "provisional-image" ? "warn" : "mute"} style={{ fontSize: 8 }}>
                          {f.replace(/-/g, " ")}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="ops-num">
                    {product.price.selling === null
                      ? <span style={{ color: "var(--faint)" }}>not priced</span>
                      : formatInr(product.price.selling)}
                  </td>
                  <td className="ops-num" style={{ color: product.images.length ? "var(--body)" : "#e0857a" }}>{product.images.length}</td>
                  <td className="ops-num">{product.specs.length}</td>
                  <td className="ops-num" style={{ color: product.confidence.overall > 0.7 ? "var(--accent)" : "var(--dim)" }}>
                    {(product.confidence.overall * 100).toFixed(0)}%
                  </td>
                  <td>
                    {product.status === "ready"
                      ? <span className="ops-chip" data-tone="good">Live</span>
                      : <span className="ops-chip" data-tone="warn">Review</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
