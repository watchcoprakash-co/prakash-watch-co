import Link from "next/link";
import { listBills } from "@/lib/sales";
import { readJournal } from "@/lib/journal";
import { balanceSheet, gstSummary, profitAndLoss, stockValuation, syncBills, trialBalance } from "@/lib/books";
import { accountName } from "@/lib/accounts";
import { Icons, PageHead, Stat, formatInr } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const money = (n: number) => formatInr(n);

export default async function BooksPage({ searchParams }: { searchParams: Promise<{ view?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const view = params.view ?? "daybook";

  // Any bill written since the last visit is posted before anything is reported,
  // so the books can never quietly fall behind the till.
  const bills = await listBills();
  await syncBills(bills);

  const today = new Date();
  const yearStart = new Date(today.getFullYear(), today.getMonth() >= 3 ? 3 : -9, 1);
  const from = params.from ?? yearStart.toISOString().slice(0, 10);
  const to = params.to ?? today.toISOString().slice(0, 10);

  const [journal, trial, pnl, sheet, gst, stock] = await Promise.all([
    readJournal(),
    trialBalance(to),
    profitAndLoss(from, to),
    balanceSheet(to),
    gstSummary(bills, from, to),
    stockValuation(),
  ]);

  const VIEWS = [
    { key: "daybook", label: "Day book" },
    { key: "trial", label: "Trial balance" },
    { key: "pnl", label: "Profit & loss" },
    { key: "balance", label: "Balance sheet" },
    { key: "gst", label: "GST" },
    { key: "stock", label: "Stock valuation" },
    { key: "audit", label: "Audit trail" },
  ];

  return (
    <>
      <PageHead
        title="Books"
        lead={`Double-entry ledger for ${from} to ${to}. Every figure below is derived from the same journal, so the day book, trial balance and balance sheet cannot disagree.`}
      />

      <section className="ops-cards">
        <Stat label="Revenue" value={money(pnl.totalRevenue)} tone="accent" sub="Sales at list value" />
        <Stat label="Gross profit" value={pnl.costMissing ? "—" : money(pnl.grossProfit)}
          sub={pnl.costMissing ? "Needs cost prices" : `${pnl.totalRevenue ? ((pnl.grossProfit / pnl.totalRevenue) * 100).toFixed(1) : 0}% margin`}
          tone={pnl.costMissing ? "warn" : "plain"} />
        <Stat label="Net profit" value={money(pnl.netProfit)} sub="After operating expenses" />
        <Stat label="GST payable" value={money(gst.payable)} sub={`Output ${money(gst.outputTax)} less input ${money(gst.inputTax)}`} />
      </section>

      <nav aria-label="Reports" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "20px 0 16px" }}>
        {VIEWS.map((option) => (
          <Link key={option.key} href={`/admin/books?view=${option.key}`} className="ops-chip"
            data-tone={view === option.key ? "good" : "mute"}
            style={{ borderColor: view === option.key ? "var(--accent)" : undefined, cursor: "pointer" }}>
            {option.label}
          </Link>
        ))}

        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <a className="ops-btn" href={`/api/admin/books/export?view=${view}&from=${from}&to=${to}`}>
            {Icons.download} CSV
          </a>
          <Link className="ops-btn" href={`/admin/books/print?view=${view}&from=${from}&to=${to}`}>
            {Icons.print} Print
          </Link>
          <Link className="ops-btn" data-variant="solid" href={`/admin/books/print?view=all&from=${from}&to=${to}`}>
            Print all records
          </Link>
        </span>
      </nav>

      {pnl.costMissing && (
        <p className="ops-panel" style={{ margin: "0 0 16px", padding: "12px 16px", fontSize: 12.5, fontWeight: 300, color: "#d8b98a", borderColor: "#4a3f2c", lineHeight: 1.7 }}>
          No cost prices are recorded, so cost of goods sold is nil and gross profit equals revenue — which is not true.
          Add a cost column to the stock sheet (<span className="mono">Cost</span>, <span className="mono">Purchase Price</span> or
          <span className="mono"> Dealer Price</span> are all recognised) and the margin, stock valuation and balance sheet become real.
        </p>
      )}

      {view === "daybook" && <DayBook entries={journal} />}
      {view === "trial" && <Trial trial={trial} />}
      {view === "pnl" && <Pnl pnl={pnl} />}
      {view === "balance" && <Sheet sheet={sheet} />}
      {view === "gst" && <Gst gst={gst} />}
      {view === "stock" && <Stock stock={stock} />}
      {view === "audit" && <Audit entries={journal} />}
    </>
  );
}

function DayBook({ entries }: { entries: Awaited<ReturnType<typeof readJournal>> }) {
  const recent = [...entries].reverse().slice(0, 120);
  if (!recent.length) {
    return <p className="ops-panel" style={{ fontSize: 13, color: "var(--muted)" }}>Nothing posted yet.</p>;
  }

  return (
    <div className="ops-panel" style={{ padding: 0 }}>
      <table className="ops-table">
        <thead>
          <tr><th>Date</th><th>Voucher</th><th>Particulars</th><th>Account</th>
            <th style={{ textAlign: "right" }}>Debit</th><th style={{ textAlign: "right" }}>Credit</th></tr>
        </thead>
        <tbody>
          {recent.map((entry) =>
            entry.lines.map((line, index) => (
              <tr key={`${entry.id}-${index}`}>
                <td className="mono" style={{ fontSize: 10.5, color: index === 0 ? "var(--body)" : "transparent" }}>
                  {new Date(entry.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                </td>
                <td className="mono" style={{ fontSize: 10, color: index === 0 ? "var(--text)" : "transparent" }}>{entry.voucherNo}</td>
                <td style={{ fontSize: 12, color: index === 0 ? "var(--body)" : "transparent" }}>
                  {entry.narration}
                  {entry.demo && index === 0 && <span className="ops-chip" data-tone="warn" style={{ marginLeft: 6, fontSize: 8 }}>demo</span>}
                </td>
                <td style={{ fontSize: 12 }}>{accountName(line.account)}</td>
                <td className="ops-num" style={{ color: line.debit ? "var(--text)" : "var(--faint)" }}>{line.debit ? money(line.debit) : "—"}</td>
                <td className="ops-num" style={{ color: line.credit ? "var(--text)" : "var(--faint)" }}>{line.credit ? money(line.credit) : "—"}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

function Trial({ trial }: { trial: Awaited<ReturnType<typeof trialBalance>> }) {
  return (
    <div className="ops-panel" style={{ padding: 0 }}>
      <table className="ops-table">
        <thead><tr><th>Code</th><th>Account</th><th>Group</th>
          <th style={{ textAlign: "right" }}>Debit</th><th style={{ textAlign: "right" }}>Credit</th></tr></thead>
        <tbody>
          {trial.rows.map((row) => (
            <tr key={row.code}>
              <td className="mono" style={{ fontSize: 10.5, color: "var(--dim)" }}>{row.code}</td>
              <td style={{ color: "var(--text)" }}>{row.name}</td>
              <td style={{ fontSize: 12, color: "var(--dim)" }}>{row.group}</td>
              <td className="ops-num">{row.debit ? money(row.debit) : "—"}</td>
              <td className="ops-num">{row.credit ? money(row.credit) : "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "1px solid var(--line)" }}>
            <td colSpan={3} className="mono" style={{ fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--faint)", paddingTop: 14 }}>
              {trial.balanced ? "Balanced" : "OUT OF BALANCE"}
            </td>
            <td className="ops-num" style={{ color: "var(--text)", paddingTop: 14 }}>{money(trial.totalDebit)}</td>
            <td className="ops-num" style={{ color: "var(--text)", paddingTop: 14 }}>{money(trial.totalCredit)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Pnl({ pnl }: { pnl: Awaited<ReturnType<typeof profitAndLoss>> }) {
  return (
    <div className="ops-panel" style={{ maxWidth: 620 }}>
      <Group title="Revenue" rows={pnl.revenue} total={pnl.totalRevenue} />
      <Group title="Direct costs" rows={pnl.directCosts} total={pnl.totalDirect} />
      <Total label="Gross profit" value={pnl.grossProfit} strong />
      <Group title="Operating expenses" rows={pnl.operating} total={pnl.totalOperating} />
      <Total label="Net profit" value={pnl.netProfit} strong accent />
    </div>
  );
}

function Sheet({ sheet }: { sheet: Awaited<ReturnType<typeof balanceSheet>> }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
      <div className="ops-panel">
        <Group title="Assets" rows={sheet.assets} total={sheet.totalAssets} />
      </div>
      <div className="ops-panel">
        <Group title="Liabilities" rows={sheet.liabilities} total={sheet.totalLiabilities} />
        <Group title="Capital" rows={sheet.equity} total={sheet.totalEquity} />
        <Total label="Liabilities + capital" value={sheet.totalLiabilities + sheet.totalEquity} strong />
        <p className="mono" style={{ marginTop: 14, fontSize: 9.5, letterSpacing: ".14em", textTransform: "uppercase",
          color: sheet.balanced ? "var(--accent)" : "#e0857a" }}>
          {sheet.balanced ? "Balanced" : `Out by ${money(Math.abs(sheet.difference))}`}
        </p>
      </div>
    </div>
  );
}

function Gst({ gst }: { gst: Awaited<ReturnType<typeof gstSummary>> }) {
  return (
    <div className="ops-panel" style={{ maxWidth: 680 }}>
      <h3 className="mono" style={{ margin: "0 0 14px", fontSize: 9.5, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 400 }}>
        Outward supplies · {gst.from} to {gst.upto}
      </h3>
      <table className="ops-table">
        <thead><tr><th>Rate</th><th style={{ textAlign: "right" }}>Invoices</th>
          <th style={{ textAlign: "right" }}>Taxable value</th><th style={{ textAlign: "right" }}>Tax</th></tr></thead>
        <tbody>
          {gst.outward.map((row) => (
            <tr key={row.rate}>
              <td className="mono">{row.rate}%</td>
              <td className="ops-num">{row.count}</td>
              <td className="ops-num">{money(row.taxable)}</td>
              <td className="ops-num" style={{ color: "var(--text)" }}>{money(row.tax)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 16 }}>
        <Total label="Output tax on sales" value={gst.outputTax} />
        <Total label="Input credit on purchases" value={-gst.inputTax} />
        <Total label="Payable to the department" value={gst.payable} strong accent />
      </div>
      <p style={{ marginTop: 14, fontSize: 11.5, fontWeight: 300, color: "var(--dim)", lineHeight: 1.7 }}>
        Grouped by rate, which is the shape GSTR-3B asks for and what a preparer reconciles GSTR-1 against.
        Watches attract 18%; the rate is stored per invoice, so a change is never applied retrospectively.
      </p>
    </div>
  );
}

function Stock({ stock }: { stock: Awaited<ReturnType<typeof stockValuation>> }) {
  return (
    <>
      <section className="ops-cards" style={{ marginBottom: 16 }}>
        <Stat label="At cost" value={stock.atCost ? money(stock.atCost) : "—"} tone={stock.atCost ? "plain" : "warn"}
          sub={stock.costed ? `${stock.costed} references costed` : "No cost prices recorded"} />
        <Stat label="At retail" value={money(stock.atRetail)} sub="What it would fetch at list" />
        <Stat label="Unrealised margin" value={stock.atCost ? money(stock.atRetail - stock.atCost) : "—"}
          sub={stock.atCost ? "Retail less cost" : "Needs cost prices"} />
        <Stat label="Without a cost" value={String(stock.uncosted)} tone={stock.uncosted ? "warn" : "plain"}
          sub="Excluded from the cost valuation" />
      </section>
      <div className="ops-panel" style={{ padding: 0 }}>
        <table className="ops-table">
          <thead><tr><th>Watch</th><th>Brand</th><th style={{ textAlign: "right" }}>Units</th>
            <th style={{ textAlign: "right" }}>Cost</th><th style={{ textAlign: "right" }}>Retail</th>
            <th style={{ textAlign: "right" }}>Value at cost</th></tr></thead>
          <tbody>
            {stock.rows.map((row) => (
              <tr key={row.sku}>
                <td style={{ color: "var(--text)" }}>{row.title}</td>
                <td style={{ fontSize: 12 }}>{row.brand}</td>
                <td className="ops-num">{row.units}</td>
                <td className="ops-num" style={{ color: row.cost ? "var(--body)" : "#d8b98a" }}>{row.cost ? money(row.cost) : "not recorded"}</td>
                <td className="ops-num">{money(row.retail)}</td>
                <td className="ops-num" style={{ color: "var(--text)" }}>{row.cost ? money(row.cost * row.units) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Group({ title, rows, total }: { title: string; rows: Array<{ name: string; amount: number; note?: string }>; total: number }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <h3 className="mono" style={{ margin: "0 0 8px", fontSize: 9.5, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 400 }}>
        {title}
      </h3>
      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--dim)" }}>Nothing posted.</p>
      ) : (
        rows.map((row) => (
          <div key={row.name} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", fontSize: 12.5, fontWeight: 300, color: "var(--body)" }}>
            <span>{row.name}</span>
            <span className="mono" style={{ fontVariantNumeric: "tabular-nums" }}>{money(row.amount)}</span>
          </div>
        ))
      )}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--line2)", fontSize: 12.5 }}>
        <span style={{ color: "var(--muted)" }}>Total</span>
        <span className="mono" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{money(total)}</span>
      </div>
    </section>
  );
}

function Total({ label, value, strong, accent }: { label: string; value: number; strong?: boolean; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "9px 0",
      borderTop: strong ? "1px solid var(--line)" : undefined, marginTop: strong ? 4 : 0 }}>
      <span style={{ fontSize: strong ? 13.5 : 12.5, color: strong ? "var(--text)" : "var(--body)", fontWeight: 300 }}>{label}</span>
      <span className="mono" style={{ fontSize: strong ? 17 : 12.5, fontVariantNumeric: "tabular-nums",
        color: accent ? "var(--accent-soft)" : "var(--text)" }}>{money(value)}</span>
    </div>
  );
}

/**
 * The audit trail.
 *
 * Shows the transaction date beside the date the entry was actually written,
 * because the gap between them is the first thing an auditor looks for. Nothing
 * here can be edited — the note says so, and the journal enforces it.
 */
function Audit({ entries }: { entries: Awaited<ReturnType<typeof readJournal>> }) {
  const recent = [...entries].reverse().slice(0, 200);
  const backdated = entries.filter((entry) => entry.date < entry.createdAt.slice(0, 10)).length;

  return (
    <>
      <p className="ops-panel" style={{ margin: "0 0 16px", padding: "12px 16px", fontSize: 12.5, fontWeight: 300, color: "var(--muted)", lineHeight: 1.7 }}>
        {entries.length} entries, append-only. Nothing is edited or deleted; a correction is posted as a reversing
        entry, which is what makes this a trail rather than a document.
        {backdated > 0 && ` ${backdated} were entered after the date they record.`}
      </p>
      <div className="ops-panel" style={{ padding: 0 }}>
        <table className="ops-table">
          <thead>
            <tr><th>Entry</th><th>Transaction date</th><th>Posted on</th><th>Type</th>
              <th>Particulars</th><th>Reference</th><th style={{ textAlign: "right" }}>Amount</th></tr>
          </thead>
          <tbody>
            {recent.map((entry) => (
              <tr key={entry.id}>
                <td className="mono" style={{ fontSize: 10, color: "var(--text)" }}>{entry.voucherNo}</td>
                <td className="mono" style={{ fontSize: 10.5 }}>{entry.date}</td>
                <td className="mono" style={{ fontSize: 10, color: entry.date < entry.createdAt.slice(0, 10) ? "#d8b98a" : "var(--dim)" }}>
                  {entry.createdAt.slice(0, 10)}
                </td>
                <td><span className="ops-chip" data-tone="mute">{entry.type}</span></td>
                <td style={{ fontSize: 12 }}>
                  {entry.narration}
                  {entry.demo && <span className="ops-chip" data-tone="warn" style={{ marginLeft: 6, fontSize: 8 }}>demo</span>}
                </td>
                <td className="mono" style={{ fontSize: 9.5, color: "var(--dim)" }}>{entry.reference || "—"}</td>
                <td className="ops-num" style={{ color: "var(--text)" }}>
                  {money(entry.lines.reduce((sum, line) => sum + line.debit, 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
