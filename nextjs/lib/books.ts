/**
 * Posting rules and the statutory reports.
 *
 * This is where a sale stops being a row in a sales list and becomes accounting:
 * money in, revenue earned, tax owed, stock consumed. Every report below is
 * derived from the journal alone, so the day book, trial balance, profit and loss
 * and balance sheet are guaranteed to agree — they are the same ledger read four
 * ways.
 *
 * One honest limitation is stated wherever it matters: gross profit and stock
 * valuation need what the shop *paid*, and a stock list quoting only selling
 * price and MRP does not carry it. Where cost is unknown the reports say so
 * rather than substituting retail, because a balance sheet that values stock at
 * the price you hope to get is not a balance sheet.
 */
import "server-only";
import { ACCOUNTS, BY_CODE, CODES, accountForPayment, type Account } from "@/lib/accounts";
import { balances, post, readJournal, type DraftEntry, type Entry } from "@/lib/journal";
import { getAllProducts } from "@/lib/catalog";
import type { Bill } from "@/lib/sales";

const round2 = (value: number) => Math.round(value * 100) / 100;

// ── Posting ────────────────────────────────────────────────────────────────────

/**
 * The entry a sale makes.
 *
 *   Dr  Cash / Bank / Debtors      total including GST
 *   Dr  Discount allowed           whatever was given off list
 *     Cr  Sales                    at list value
 *     Cr  Output GST               tax charged
 *
 * Booking sales at list and the reduction as "discount allowed" is deliberate:
 * it keeps what the shop gives away visible in the P&L instead of silently
 * shrinking revenue, which is how a boutique loses track of its own margin.
 */
export function saleEntry(bill: Bill): DraftEntry {
  const listValue = bill.lines.reduce((sum, line) => sum + line.listPrice * line.quantity, 0);
  const discount = round2(Math.max(0, listValue - bill.taxable));

  return {
    date: bill.issuedAt.slice(0, 10),
    type: "sale",
    narration: `Sale to ${bill.customer.name}`,
    reference: bill.number,
    party: bill.customer.name,
    demo: bill.demo,
    lines: [
      { account: accountForPayment(bill.payment), debit: bill.total, note: bill.payment },
      { account: CODES.discount, debit: discount },
      { account: CODES.sales, credit: round2(listValue) },
      { account: CODES.outputGst, credit: bill.gstAmount, note: `GST ${bill.gstRate}%` },
    ],
  };
}

/** Stock consumed by a sale, posted only where cost is actually known. */
export function cogsEntry(bill: Bill, costBySku: Map<string, number>): DraftEntry | null {
  const cost = bill.lines.reduce((sum, line) => sum + (costBySku.get(line.sku) ?? 0) * line.quantity, 0);
  if (cost <= 0) return null;

  return {
    date: bill.issuedAt.slice(0, 10),
    type: "journal",
    narration: `Cost of watches sold on ${bill.number}`,
    reference: bill.number,
    demo: bill.demo,
    lines: [
      { account: CODES.cogs, debit: round2(cost) },
      { account: CODES.stock, credit: round2(cost) },
    ],
  };
}

/** Which bills the journal has already seen, so posting twice is impossible. */
export async function postedBillNumbers(): Promise<Set<string>> {
  const entries = await readJournal();
  return new Set(entries.filter((entry) => entry.type === "sale").map((entry) => entry.reference));
}

/** Posts any bill not yet in the books. Safe to run repeatedly. */
export async function syncBills(bills: Bill[]): Promise<number> {
  const already = await postedBillNumbers();
  const products = await getAllProducts();
  const costBySku = new Map(
    products.filter((p) => p.costPrice).map((p) => [p.sku, p.costPrice as number] as const),
  );

  const drafts: DraftEntry[] = [];
  for (const bill of bills) {
    if (bill.status === "void" || already.has(bill.number)) continue;
    drafts.push(saleEntry(bill));
    const cogs = cogsEntry(bill, costBySku);
    if (cogs) drafts.push(cogs);
  }

  if (!drafts.length) return 0;
  await post(drafts);
  return drafts.length;
}

// ── Reports ────────────────────────────────────────────────────────────────────

export interface TrialRow extends Account {
  debit: number;
  credit: number;
}

export interface TrialBalance {
  rows: TrialRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

export async function trialBalance(upto?: string): Promise<TrialBalance> {
  const totals = await balances(upto);
  const rows: TrialRow[] = [];

  for (const account of ACCOUNTS) {
    const total = totals.get(account.code);
    if (!total || (total.debit === 0 && total.credit === 0)) continue;
    const net = round2(total.debit - total.credit);
    rows.push({
      ...account,
      debit: net > 0 ? net : 0,
      credit: net < 0 ? -net : 0,
    });
  }

  const totalDebit = round2(rows.reduce((sum, row) => sum + row.debit, 0));
  const totalCredit = round2(rows.reduce((sum, row) => sum + row.credit, 0));
  return { rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 };
}

export interface ProfitAndLoss {
  revenue: Array<{ name: string; amount: number }>;
  directCosts: Array<{ name: string; amount: number }>;
  operating: Array<{ name: string; amount: number }>;
  totalRevenue: number;
  totalDirect: number;
  grossProfit: number;
  totalOperating: number;
  netProfit: number;
  /** True when no cost of goods has been posted, so gross profit is not real. */
  costMissing: boolean;
}

export async function profitAndLoss(from?: string, upto?: string): Promise<ProfitAndLoss> {
  const totals = await balances(upto, from);
  const amountOf = (code: string) => {
    const total = totals.get(code);
    if (!total) return 0;
    const account = BY_CODE.get(code);
    // Income is a credit balance; expenses a debit. Both reported positive.
    return round2(account?.normal === "credit" ? total.credit - total.debit : total.debit - total.credit);
  };

  const pick = (kind: Account["kind"], group?: string) =>
    ACCOUNTS.filter((a) => a.kind === kind && (!group || a.group === group))
      .map((a) => ({ name: a.name, amount: amountOf(a.code) }))
      .filter((row) => row.amount !== 0);

  const revenue = pick("income");
  const directCosts = ACCOUNTS.filter((a) => a.group === "Direct costs")
    .map((a) => ({ name: a.name, amount: amountOf(a.code) }))
    .filter((row) => row.amount !== 0);
  const operating = pick("expense", "Operating expenses");

  const totalRevenue = round2(revenue.reduce((sum, row) => sum + row.amount, 0));
  const totalDirect = round2(directCosts.reduce((sum, row) => sum + row.amount, 0));
  const totalOperating = round2(operating.reduce((sum, row) => sum + row.amount, 0));
  const grossProfit = round2(totalRevenue - totalDirect);

  return {
    revenue,
    directCosts,
    operating,
    totalRevenue,
    totalDirect,
    grossProfit,
    totalOperating,
    netProfit: round2(grossProfit - totalOperating),
    costMissing: amountOf(CODES.cogs) === 0 && totalRevenue > 0,
  };
}

export interface BalanceSheet {
  assets: Array<{ name: string; amount: number; note?: string }>;
  liabilities: Array<{ name: string; amount: number; note?: string }>;
  equity: Array<{ name: string; amount: number; note?: string }>;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  retainedProfit: number;
  balanced: boolean;
  difference: number;
}

export async function balanceSheet(upto?: string): Promise<BalanceSheet> {
  const totals = await balances(upto);
  const net = (code: string) => {
    const total = totals.get(code);
    if (!total) return 0;
    const account = BY_CODE.get(code);
    return round2(account?.normal === "credit" ? total.credit - total.debit : total.debit - total.credit);
  };

  const rowsFor = (kind: Account["kind"]) =>
    ACCOUNTS.filter((a) => a.kind === kind)
      .map((a) => ({ name: a.name, amount: net(a.code), note: a.note }))
      .filter((row) => row.amount !== 0);

  const assets = rowsFor("asset");
  const liabilities = rowsFor("liability");
  const equityAccounts = rowsFor("equity");

  // Profit for the period is not a posted account; it is what the books have
  // earned and therefore belongs to the proprietor.
  const pnl = await profitAndLoss(undefined, upto);
  const retainedProfit = pnl.netProfit;

  const totalAssets = round2(assets.reduce((sum, row) => sum + row.amount, 0));
  const totalLiabilities = round2(liabilities.reduce((sum, row) => sum + row.amount, 0));
  const totalEquity = round2(equityAccounts.reduce((sum, row) => sum + row.amount, 0) + retainedProfit);
  const difference = round2(totalAssets - (totalLiabilities + totalEquity));

  return {
    assets,
    liabilities,
    equity: [...equityAccounts, { name: "Profit for the period", amount: retainedProfit }],
    totalAssets,
    totalLiabilities,
    totalEquity,
    retainedProfit,
    balanced: Math.abs(difference) < 0.01,
    difference,
  };
}

export interface GstSummary {
  from: string;
  upto: string;
  outward: Array<{ rate: number; taxable: number; tax: number; count: number }>;
  totalTaxable: number;
  outputTax: number;
  inputTax: number;
  payable: number;
  bills: number;
}

/**
 * GST as the return needs it: taxable value and tax grouped by rate.
 *
 * This is the shape of GSTR-3B's outward supplies and the summary a preparer
 * reconciles GSTR-1 against — enough to file from, and enough to check.
 */
export async function gstSummary(bills: Bill[], from: string, upto: string): Promise<GstSummary> {
  const inScope = bills.filter((bill) => bill.status !== "void" && bill.issuedAt >= from && bill.issuedAt <= `${upto}T23:59:59Z`);

  const byRate = new Map<number, { taxable: number; tax: number; count: number }>();
  for (const bill of inScope) {
    const row = byRate.get(bill.gstRate) ?? { taxable: 0, tax: 0, count: 0 };
    row.taxable = round2(row.taxable + bill.taxable);
    row.tax = round2(row.tax + bill.gstAmount);
    row.count += 1;
    byRate.set(bill.gstRate, row);
  }

  const totals = await balances(upto, from);
  const inputTax = round2((totals.get(CODES.inputGst)?.debit ?? 0) - (totals.get(CODES.inputGst)?.credit ?? 0));
  const outputTax = round2([...byRate.values()].reduce((sum, row) => sum + row.tax, 0));

  return {
    from,
    upto,
    outward: [...byRate.entries()].map(([rate, row]) => ({ rate, ...row })).sort((a, b) => a.rate - b.rate),
    totalTaxable: round2([...byRate.values()].reduce((sum, row) => sum + row.taxable, 0)),
    outputTax,
    inputTax,
    // What actually goes to the department after claiming credit on purchases.
    payable: round2(Math.max(0, outputTax - inputTax)),
    bills: inScope.length,
  };
}

export interface StockValuation {
  rows: Array<{ sku: string; title: string; brand: string; units: number; cost: number | null; retail: number }>;
  atCost: number;
  atRetail: number;
  costed: number;
  uncosted: number;
}

export async function stockValuation(): Promise<StockValuation> {
  const products = await getAllProducts();
  const rows = products
    .filter((product) => (product.quantity ?? 0) > 0)
    .map((product) => ({
      sku: product.sku,
      title: product.title,
      brand: product.brand,
      units: product.quantity ?? 0,
      cost: product.costPrice ?? null,
      retail: product.price.selling ?? 0,
    }));

  return {
    rows: rows.sort((a, b) => b.units * b.retail - a.units * a.retail),
    atCost: round2(rows.reduce((sum, row) => sum + (row.cost ?? 0) * row.units, 0)),
    atRetail: round2(rows.reduce((sum, row) => sum + row.retail * row.units, 0)),
    costed: rows.filter((row) => row.cost !== null).length,
    uncosted: rows.filter((row) => row.cost === null).length,
  };
}

export type { Entry };
