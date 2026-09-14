import Link from "next/link";
import { getInventory, LOW_STOCK_THRESHOLD } from "@/lib/analytics";
import { readLedger } from "@/lib/ledger";
import StockCell from "@/components/admin/StockCell";
import { Empty, PageHead, Stat, formatInr } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "all", label: "Everything" },
  { key: "low", label: "Last piece" },
  { key: "out", label: "Out of stock" },
  { key: "moving", label: "Selling" },
] as const;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter = "all" } = await searchParams;
  const [rows, ledger] = await Promise.all([getInventory(), readLedger()]);

  const shown = rows.filter(({ product, sold }) => {
    const qty = product.quantity ?? 0;
    if (filter === "low") return qty > 0 && qty <= LOW_STOCK_THRESHOLD;
    if (filter === "out") return qty === 0;
    if (filter === "moving") return sold > 0;
    return true;
  });

  const units = rows.reduce((sum, r) => sum + (r.product.quantity ?? 0), 0);
  const value = rows.reduce((sum, r) => sum + r.value, 0);
  const out = rows.filter((r) => (r.product.quantity ?? 0) === 0).length;
  const sold = rows.reduce((sum, r) => sum + r.sold, 0);

  return (
    <>
      <PageHead
        title="Inventory"
        lead="What is on the shelf, what it is worth, and what is moving. Type a corrected count and it is recorded against the reference."
      />

      <section className="ops-cards">
        <Stat label="Units in stock" value={String(units)} sub={`${rows.length} references`} />
        <Stat label="Value at retail" value={formatInr(value)} tone="accent" sub="Selling price × units" />
        <Stat label="Out of stock" value={String(out)} tone={out ? "warn" : "plain"} sub="Listed but unavailable" />
        <Stat label="Sold all time" value={String(sold)} sub={`${ledger.length} stock movements recorded`} />
      </section>

      <nav aria-label="Filter stock" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "20px 0 12px" }}>
        {FILTERS.map((option) => {
          const active = filter === option.key;
          const count = option.key === "all" ? rows.length
            : option.key === "low" ? rows.filter((r) => (r.product.quantity ?? 0) > 0 && (r.product.quantity ?? 0) <= LOW_STOCK_THRESHOLD).length
            : option.key === "out" ? out
            : rows.filter((r) => r.sold > 0).length;
          return (
            <Link key={option.key} href={option.key === "all" ? "/admin/inventory" : `/admin/inventory?filter=${option.key}`}
              className="ops-chip" data-tone={active ? "good" : "mute"}
              style={{ borderColor: active ? "var(--accent)" : undefined }}>
              {option.label} {count}
            </Link>
          );
        })}
      </nav>

      {shown.length === 0 ? (
        <Empty title="Nothing here" body="No reference matches that filter right now." href="/admin/inventory" cta="Show everything" />
      ) : (
        <div className="ops-panel" style={{ padding: 0 }}>
          <table className="ops-table">
            <thead>
              <tr>
                <th>Watch</th><th>Brand</th>
                <th style={{ textAlign: "right" }}>Price</th>
                <th style={{ width: 116 }}>In stock</th>
                <th style={{ textAlign: "right" }}>Value</th>
                <th style={{ textAlign: "right" }}>Sold</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ product, sold: soldCount, value: rowValue }) => {
                const qty = product.quantity ?? 0;
                return (
                  <tr key={product.sku}>
                    <td>
                      <Link href={`/admin/review/${product.sku}`} style={{ color: "var(--text)" }}>{product.title}</Link>
                      <span className="mono" style={{ display: "block", fontSize: 9.5, color: "var(--faint)", marginTop: 2 }}>
                        {product.modelNumber.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{product.brand}</td>
                    <td className="ops-num">
                    {product.price.selling === null
                      ? <span style={{ color: "var(--faint)" }}>not priced</span>
                      : formatInr(product.price.selling)}
                  </td>
                    <td><StockCell sku={product.sku} quantity={qty} /></td>
                    <td className="ops-num" style={{ color: qty ? "var(--text)" : "var(--faint)" }}>{formatInr(rowValue)}</td>
                    <td className="ops-num" style={{ color: soldCount ? "var(--accent)" : "var(--faint)" }}>{soldCount || "—"}</td>
                    <td>
                      {qty === 0 ? <span className="ops-chip" data-tone="bad">Out</span>
                        : qty <= LOW_STOCK_THRESHOLD ? <span className="ops-chip" data-tone="warn">Last piece</span>
                        : <span className="ops-chip" data-tone="good">In stock</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
