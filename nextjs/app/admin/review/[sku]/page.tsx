import Link from "next/link";
import { notFound } from "next/navigation";
import ReviewForm from "@/components/admin/ReviewForm";
import RerunPanel from "@/components/admin/RerunPanel";
import { getProduct } from "@/lib/catalog";
import { REVIEW_FLAG_EXPLANATIONS } from "@/agent/types";
import { formatUsd } from "@/agent/format";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const product = await getProduct(sku);
  if (!product) notFound();

  return (
    <main style={{ padding: "34px 34px 90px", display: "grid", gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 1fr)", gap: 44, alignItems: "start" }}>
      <div>
        <Link href="/admin" data-hover className="mono" style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "var(--faint)", textTransform: "uppercase" }}>
          ← Stock list
        </Link>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, margin: "16px 0 32px" }}>
          <div>
            <h1 className="serif" style={{ fontSize: 38, margin: 0, fontWeight: 400, lineHeight: 1.1 }}>
              {product.title}
            </h1>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.16em", color: "var(--faint)", marginTop: 8 }}>
              REF {product.modelNumber.toUpperCase()} · SHEET ROW {product.meta.sheetRow}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {product.status === "ready" && (
              <Link
                href={`/watch/${product.slug}`}
                target="_blank"
                data-hover
                className="mono"
                style={{ fontSize: 9.5, letterSpacing: "0.16em", color: "var(--muted)", textTransform: "uppercase" }}
              >
                View live ↗
              </Link>
            )}
            <span
              className="mono"
              style={{
                fontSize: 9.5,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                padding: "8px 12px",
                border: `1px solid ${product.status === "ready" ? "var(--accent)" : "var(--border)"}`,
                color: product.status === "ready" ? "var(--accent)" : "var(--dim)",
              }}
            >
              {product.status === "ready" ? "Listed" : "Awaiting review"}
            </span>
          </div>
        </div>

        <section style={{ border: "1px solid var(--line)", background: "var(--card)", padding: 20, marginBottom: 26 }}>
          <span className="ops-sublabel" style={{ marginTop: 0 }}>Research this watch again</span>
          <p style={{ fontSize: 12.5, lineHeight: 1.6, fontWeight: 300, color: "var(--dim)", margin: "0 0 14px", maxWidth: 620 }}>
            Runs the whole pipeline afresh — sources, specification, photographs and price. Anything you have
            typed here is kept; anything the agent guessed is worked out again.
          </p>
          <RerunPanel
            mode="one"
            sku={product.sku}
            label={product.title}
            canSetReference={product.modelNumber.replace(/[^A-Za-z0-9]/g, "").length < 6}
          />
        </section>

        <ReviewForm product={product} />
      </div>

      {/* What the agent found, read-only */}
      <aside style={{ display: "flex", flexDirection: "column", gap: 28, position: "sticky", top: 90 }}>
        <Panel title="Confidence">
          <Meter label="Overall" value={product.confidence.overall} />
          <Meter label="Right watch" value={product.confidence.identity} />
          <Meter label="Specifications" value={product.confidence.specs} />
          <Meter label="Photographs" value={product.confidence.images} />
        </Panel>

        {product.review.flags.length > 0 && (
          <Panel title="Why it is held">
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 13 }}>
              {product.review.flags.map((flag) => (
                <li key={flag}>
                  <div className="mono" style={{ fontSize: 9, letterSpacing: "0.14em", color: "#d8b98a", textTransform: "uppercase" }}>
                    {flag.replace(/-/g, " ")}
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6, fontWeight: 300, color: "var(--muted)", marginTop: 4 }}>
                    {REVIEW_FLAG_EXPLANATIONS[flag]}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {product.review.notes.length > 0 && (
          <Panel title="Agent notes">
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
              {product.review.notes.map((note) => (
                <li key={note} style={{ fontSize: 12, lineHeight: 1.6, fontWeight: 300, color: "var(--muted)", wordBreak: "break-word" }}>
                  {note}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {product.specs.length > 0 && (
          <Panel title={`Specifications (${product.specs.length})`}>
            <dl style={{ margin: 0 }}>
              {product.specs.map((spec) => {
                const source = spec.sourceIndex === null ? null : product.sources[spec.sourceIndex];
                return (
                  <div key={`${spec.label}-${spec.value}`} style={{ padding: "9px 0", borderBottom: "1px solid var(--line2)" }}>
                    <dt className="mono" style={{ fontSize: 8.5, letterSpacing: "0.14em", color: "var(--faint)", textTransform: "uppercase" }}>
                      {spec.label}
                      {source ? ` · ${source.publisher}` : " · unattributed"}
                    </dt>
                    <dd style={{ margin: "4px 0 0", fontSize: 12.5, fontWeight: 300, color: "var(--body)" }}>{spec.value}</dd>
                  </div>
                );
              })}
            </dl>
          </Panel>
        )}

        <Panel title={`Sources (${product.sources.length})`}>
          {product.sources.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 300, color: "var(--muted)" }}>Nothing could be read.</p>
          ) : (
            <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 11 }}>
              {product.sources.map((source) => (
                <li key={source.url}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer nofollow"
                    data-hover
                    style={{ fontSize: 12.5, fontWeight: 300, color: "var(--body)", wordBreak: "break-word" }}
                  >
                    [{source.index}] {source.publisher}
                  </a>
                  <div className="mono" style={{ fontSize: 8.5, letterSpacing: "0.12em", color: "var(--faint)", marginTop: 3, textTransform: "uppercase" }}>
                    {source.kind}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Run">
          <div className="mono" style={{ fontSize: 9.5, lineHeight: 1.9, letterSpacing: "0.08em", color: "var(--faint)" }}>
            {product.meta.runId}
            <br />
            {product.meta.model}
            <br />
            {formatUsd(product.meta.costUsd)} · {product.meta.sourceFile}
            <br />
            UPDATED {new Date(product.meta.updatedAt).toLocaleString("en-IN")}
          </div>
        </Panel>
      </aside>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ border: "1px solid var(--line)", background: "var(--card)", padding: "18px 18px 20px" }}>
      <h2 className="kicker" style={{ display: "block", marginBottom: 14 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, fontWeight: 300, color: "var(--muted)", marginBottom: 5 }}>
        <span>{label}</span>
        <span className="mono" style={{ fontSize: 10 }}>{(value * 100).toFixed(0)}%</span>
      </div>
      <div style={{ height: 2, background: "var(--line)" }}>
        <div style={{ height: "100%", width: `${value * 100}%`, background: value > 0.7 ? "var(--accent)" : "var(--dim)" }} />
      </div>
    </div>
  );
}
