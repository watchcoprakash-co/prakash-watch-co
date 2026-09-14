import { requireAuth } from "@/lib/auth";
import { listBills } from "@/lib/sales";
import { readJournal } from "@/lib/journal";
import { accountName } from "@/lib/accounts";
import { balanceSheet, gstSummary, profitAndLoss, stockValuation, syncBills, trialBalance } from "@/lib/books";

export const runtime = "nodejs";

/** Quotes a field for CSV: doubles quotes, wraps anything with a comma or newline. */
function cell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const toCsv = (rows: unknown[][]) => rows.map((row) => row.map(cell).join(",")).join("\r\n");

/**
 * Any report as CSV, for the accountant.
 *
 * Excel opens UTF-8 correctly only when the file starts with a byte-order mark,
 * and a rupee sign in a spreadsheet that renders as mojibake is worse than no
 * export at all — so one is prepended.
 */
export async function GET(request: Request): Promise<Response> {
  const unauthorised = await requireAuth();
  if (unauthorised) return unauthorised;

  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "daybook";
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;

  const bills = await listBills();
  await syncBills(bills);

  let rows: unknown[][] = [];
  let name = view;

  if (view === "daybook" || view === "audit") {
    const entries = await readJournal();
    const scoped = entries.filter((e) => (!from || e.date >= from) && (!to || e.date <= to));
    rows = [["Date", "Voucher", "Type", "Particulars", "Party", "Account code", "Account", "Debit", "Credit", "Reference", "Posted at", "Sample"]];
    for (const entry of scoped) {
      for (const line of entry.lines) {
        rows.push([entry.date, entry.voucherNo, entry.type, entry.narration, entry.party,
          line.account, accountName(line.account), line.debit || "", line.credit || "",
          entry.reference, entry.createdAt, entry.demo ? "yes" : "no"]);
      }
    }
    name = view === "audit" ? "audit-trail" : "day-book";
  } else if (view === "trial") {
    const trial = await trialBalance(to);
    rows = [["Code", "Account", "Group", "Debit", "Credit"],
      ...trial.rows.map((r) => [r.code, r.name, r.group, r.debit || "", r.credit || ""]),
      ["", "TOTAL", "", trial.totalDebit, trial.totalCredit]];
    name = "trial-balance";
  } else if (view === "pnl") {
    const pnl = await profitAndLoss(from, to);
    rows = [["Section", "Account", "Amount"]];
    for (const r of pnl.revenue) rows.push(["Revenue", r.name, r.amount]);
    rows.push(["", "Total revenue", pnl.totalRevenue]);
    for (const r of pnl.directCosts) rows.push(["Direct costs", r.name, r.amount]);
    rows.push(["", "Gross profit", pnl.grossProfit]);
    for (const r of pnl.operating) rows.push(["Operating expenses", r.name, r.amount]);
    rows.push(["", "Net profit", pnl.netProfit]);
    name = "profit-and-loss";
  } else if (view === "balance") {
    const sheet = await balanceSheet(to);
    rows = [["Section", "Account", "Amount"]];
    for (const r of sheet.assets) rows.push(["Assets", r.name, r.amount]);
    rows.push(["", "Total assets", sheet.totalAssets]);
    for (const r of sheet.liabilities) rows.push(["Liabilities", r.name, r.amount]);
    for (const r of sheet.equity) rows.push(["Capital", r.name, r.amount]);
    rows.push(["", "Total liabilities and capital", sheet.totalLiabilities + sheet.totalEquity]);
    name = "balance-sheet";
  } else if (view === "gst") {
    const gst = await gstSummary(bills, from ?? "1970-01-01", to ?? new Date().toISOString().slice(0, 10));
    rows = [["Rate %", "Invoices", "Taxable value", "Tax"],
      ...gst.outward.map((r) => [r.rate, r.count, r.taxable, r.tax]),
      [], ["Output tax", "", "", gst.outputTax], ["Input credit", "", "", gst.inputTax], ["Payable", "", "", gst.payable]];
    name = "gst-summary";
  } else if (view === "stock") {
    const stock = await stockValuation();
    rows = [["SKU", "Watch", "Brand", "Units", "Cost each", "Retail each", "Value at cost", "Value at retail"],
      ...stock.rows.map((r) => [r.sku, r.title, r.brand, r.units, r.cost ?? "not recorded", r.retail,
        r.cost ? r.cost * r.units : "", r.retail * r.units]),
      [], ["", "TOTAL", "", "", "", "", stock.atCost, stock.atRetail]];
    name = "stock-valuation";
  } else if (view === "bills") {
    rows = [["Invoice", "Date", "Customer", "Phone", "Watches", "Taxable", "GST rate", "GST", "Total", "Payment", "Sample"],
      ...bills.map((b) => [b.number, b.issuedAt.slice(0, 10), b.customer.name, b.customer.phone,
        b.lines.map((l) => `${l.title} x${l.quantity}`).join("; "),
        b.taxable, b.gstRate, b.gstAmount, b.total, b.payment, b.demo ? "yes" : "no"])];
    name = "sales-register";
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${toCsv(rows)}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}-${stamp}.csv"`,
    },
  });
}
