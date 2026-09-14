import Link from "next/link";
import { getFirm, financialYear } from "@/lib/firm";
import { listBills } from "@/lib/sales";
import { readJournal } from "@/lib/journal";
import { accountName } from "@/lib/accounts";
import { balanceSheet, gstSummary, profitAndLoss, stockValuation, syncBills, trialBalance } from "@/lib/books";
import Letterhead from "@/components/admin/Letterhead";
import Signature from "@/components/admin/Signature";
import PrintButton from "@/components/admin/PrintButton";
import { formatInr } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const money = (n: number) => formatInr(n);
const ALL = ["trial", "pnl", "balance", "gst", "stock", "audit"] as const;
type View = (typeof ALL)[number];

const TITLES: Record<View, string> = {
  trial: "Trial balance",
  pnl: "Profit and loss account",
  balance: "Balance sheet",
  gst: "GST summary — outward supplies",
  stock: "Stock valuation",
  audit: "Audit trail",
};

/**
 * The records pack.
 *
 * One page per statement, each with its own letterhead and signature block so a
 * sheet still means something when it is separated from the others — which is
 * exactly what happens in a file, or in front of an auditor.
 */
export default async function PrintBooksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const firm = await getFirm();
  const year = financialYear(new Date(), firm.financialYearStartMonth);

  const from = params.from ?? year.from;
  const to = params.to ?? year.to;
  const views: View[] = params.view && params.view !== "all" && ALL.includes(params.view as View)
    ? [params.view as View]
    : [...ALL];

  const bills = await listBills();
  await syncBills(bills);

  const [journal, trial, pnl, sheet, gst, stock] = await Promise.all([
    readJournal(), trialBalance(to), profitAndLoss(from, to), balanceSheet(to),
    gstSummary(bills, from, to), stockValuation(),
  ]);

  const period = `${new Date(from).toLocaleDateString("en-IN", { dateStyle: "medium" })} to ${new Date(to).toLocaleDateString("en-IN", { dateStyle: "medium" })}`;
  const hasDemo = journal.some((entry) => entry.demo);
  const demoNote = hasDemo ? "Includes sample data — not for filing" : undefined;

  return (
    <div className="doc">
      <div className="ops-noprint" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <Link href="/admin/books" className="mono" style={{ fontSize: 9.5, letterSpacing: ".18em", color: "var(--faint)", textTransform: "uppercase" }}>
          ← Books
        </Link>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="mono" style={{ fontSize: 9.5, color: "var(--dim)" }}>FY {year.label} · {views.length} statement{views.length === 1 ? "" : "s"}</span>
          <PrintButton />
        </div>
      </div>

      {hasDemo && (
        <p className="ops-noprint ops-panel" style={{ margin: "0 0 20px", padding: "12px 16px", fontSize: 12.5, fontWeight: 300, color: "#d8b98a", borderColor: "#4a3f2c" }}>
          These statements include demo data and invented cost prices. Every printed page carries a warning to that
          effect. Run <span className="mono">npm run demo:purge</span> before producing anything for filing.
        </p>
      )}

      {views.map((view) => (
        <section key={view} className="doc-page">
          <Letterhead firm={firm} title={TITLES[view]} period={view === "balance" || view === "stock" ? `As at ${new Date(to).toLocaleDateString("en-IN", { dateStyle: "medium" })}` : period} note={demoNote} />

          <div style={{ marginTop: 20 }}>
            {view === "trial" && (
              <table className="ops-table">
                <thead><tr><th>Code</th><th>Account</th><th style={{ textAlign: "right" }}>Debit</th><th style={{ textAlign: "right" }}>Credit</th></tr></thead>
                <tbody>
                  {trial.rows.map((row) => (
                    <tr key={row.code}>
                      <td className="mono" style={{ fontSize: 10 }}>{row.code}</td>
                      <td>{row.name}</td>
                      <td className="ops-num">{row.debit ? money(row.debit) : ""}</td>
                      <td className="ops-num">{row.credit ? money(row.credit) : ""}</td>
                    </tr>
                  ))}
                  <tr><td colSpan={2} style={{ fontWeight: 400 }}>Total</td>
                    <td className="ops-num">{money(trial.totalDebit)}</td>
                    <td className="ops-num">{money(trial.totalCredit)}</td></tr>
                </tbody>
              </table>
            )}

            {view === "pnl" && (
              <Statement sections={[
                { title: "Revenue", rows: pnl.revenue, total: pnl.totalRevenue },
                { title: "Direct costs", rows: pnl.directCosts, total: pnl.totalDirect },
                { title: "Gross profit", rows: [], total: pnl.grossProfit },
                { title: "Operating expenses", rows: pnl.operating, total: pnl.totalOperating },
                { title: "Net profit", rows: [], total: pnl.netProfit },
              ]} />
            )}

            {view === "balance" && (
              <Statement sections={[
                { title: "Assets", rows: sheet.assets, total: sheet.totalAssets },
                { title: "Liabilities", rows: sheet.liabilities, total: sheet.totalLiabilities },
                { title: "Capital", rows: sheet.equity, total: sheet.totalEquity },
                { title: "Liabilities and capital", rows: [], total: sheet.totalLiabilities + sheet.totalEquity },
              ]} footer={sheet.balanced ? "The books balance." : `Out of balance by ${money(Math.abs(sheet.difference))}.`} />
            )}

            {view === "gst" && (
              <>
                <table className="ops-table">
                  <thead><tr><th>Rate</th><th style={{ textAlign: "right" }}>Invoices</th>
                    <th style={{ textAlign: "right" }}>Taxable value</th><th style={{ textAlign: "right" }}>Tax</th></tr></thead>
                  <tbody>
                    {gst.outward.map((row) => (
                      <tr key={row.rate}><td className="mono">{row.rate}%</td><td className="ops-num">{row.count}</td>
                        <td className="ops-num">{money(row.taxable)}</td><td className="ops-num">{money(row.tax)}</td></tr>
                    ))}
                    <tr><td colSpan={2}>Output tax on sales</td><td /><td className="ops-num">{money(gst.outputTax)}</td></tr>
                    <tr><td colSpan={2}>Less input credit on purchases</td><td /><td className="ops-num">{money(gst.inputTax)}</td></tr>
                    <tr><td colSpan={2} style={{ fontWeight: 400 }}>Net payable</td><td /><td className="ops-num">{money(gst.payable)}</td></tr>
                  </tbody>
                </table>
                <p style={{ fontSize: 10.5, fontWeight: 300, color: "var(--dim)", marginTop: 12, lineHeight: 1.7 }}>
                  Grouped by rate, in the shape GSTR-3B asks for. Reconcile against GSTR-1 before filing.
                </p>
              </>
            )}

            {view === "stock" && (
              <>
                <table className="ops-table">
                  <thead><tr><th>Watch</th><th>Brand</th><th style={{ textAlign: "right" }}>Units</th>
                    <th style={{ textAlign: "right" }}>Cost</th><th style={{ textAlign: "right" }}>Value at cost</th></tr></thead>
                  <tbody>
                    {stock.rows.map((row) => (
                      <tr key={row.sku}><td>{row.title}</td><td>{row.brand}</td>
                        <td className="ops-num">{row.units}</td>
                        <td className="ops-num">{row.cost ? money(row.cost) : "not recorded"}</td>
                        <td className="ops-num">{row.cost ? money(row.cost * row.units) : ""}</td></tr>
                    ))}
                    <tr><td colSpan={4} style={{ fontWeight: 400 }}>Closing stock at cost</td>
                      <td className="ops-num">{money(stock.atCost)}</td></tr>
                  </tbody>
                </table>
                {stock.uncosted > 0 && (
                  <p style={{ fontSize: 10.5, color: "#d8b98a", marginTop: 10 }}>
                    {stock.uncosted} reference(s) carry no cost price and are excluded from the valuation above.
                  </p>
                )}
              </>
            )}

            {view === "audit" && (
              <>
                <p style={{ fontSize: 10.5, fontWeight: 300, color: "var(--dim)", marginBottom: 12, lineHeight: 1.7 }}>
                  The journal is append-only: entries are never edited or deleted, and a correction is made by posting a
                  reversing entry. &ldquo;Posted&rdquo; is when the entry was written, which may differ from the transaction date.
                  {journal.length} entries in the ledger; {journal.filter((e) => e.date >= from && e.date <= to).length} in this period.
                </p>
                <table className="ops-table">
                  <thead><tr><th>Date</th><th>Voucher</th><th>Particulars</th><th>Reference</th>
                    <th style={{ textAlign: "right" }}>Amount</th><th>Posted</th></tr></thead>
                  <tbody>
                    {journal.filter((e) => e.date >= from && e.date <= to).slice(-200).map((entry) => (
                      <tr key={entry.id}>
                        <td className="mono" style={{ fontSize: 10 }}>{entry.date}</td>
                        <td className="mono" style={{ fontSize: 10 }}>{entry.voucherNo}</td>
                        <td>{entry.narration}{entry.demo && " (sample)"}</td>
                        <td className="mono" style={{ fontSize: 9.5 }}>{entry.reference}</td>
                        <td className="ops-num">{money(entry.lines.reduce((s, l) => s + l.debit, 0))}</td>
                        <td className="mono" style={{ fontSize: 9 }}>
                          {new Date(entry.createdAt).toLocaleDateString("en-IN", { dateStyle: "short" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <Signature signatory={firm.signatory} firm={firm.name} />
        </section>
      ))}
    </div>
  );
}

function Statement({ sections, footer }: {
  sections: Array<{ title: string; rows: Array<{ name: string; amount: number }>; total: number }>;
  footer?: string;
}) {
  return (
    <>
      <table className="ops-table">
        <tbody>
          {sections.map((section) => (
            <>
              {section.rows.map((row) => (
                <tr key={`${section.title}-${row.name}`}>
                  <td style={{ paddingLeft: 18 }}>{row.name}</td>
                  <td className="ops-num">{money(row.amount)}</td>
                </tr>
              ))}
              <tr key={section.title}>
                <td style={{ fontWeight: 400 }}>{section.title}</td>
                <td className="ops-num" style={{ fontWeight: 400 }}>{money(section.total)}</td>
              </tr>
            </>
          ))}
        </tbody>
      </table>
      {footer && <p style={{ fontSize: 10.5, color: "var(--dim)", marginTop: 12 }}>{footer}</p>}
    </>
  );
}
