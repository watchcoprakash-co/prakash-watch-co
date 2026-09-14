/**
 * The chart of accounts.
 *
 * Laid out the way an Indian retail firm's books are, so that anything produced
 * here is recognisable to the shop's own accountant: assets and liabilities in
 * balance-sheet order, income and expenses in profit-and-loss order, GST split
 * into what was charged on sales and what was paid on purchases.
 *
 * Codes follow the usual 1000/2000/3000 blocks. They are stable identifiers —
 * ledgers, vouchers and reports all refer to an account by code, never by name,
 * so a name can be corrected without rewriting history.
 */
import "server-only";

export type AccountKind = "asset" | "liability" | "equity" | "income" | "expense";

export interface Account {
  code: string;
  name: string;
  kind: AccountKind;
  /** Grouping used on the balance sheet and P&L. */
  group: string;
  /** Which side increases the account — debit for assets and expenses. */
  normal: "debit" | "credit";
  note?: string;
}

export const ACCOUNTS: Account[] = [
  // Assets
  { code: "1000", name: "Cash in hand", kind: "asset", group: "Current assets", normal: "debit" },
  { code: "1010", name: "Bank account", kind: "asset", group: "Current assets", normal: "debit" },
  { code: "1100", name: "Stock in trade", kind: "asset", group: "Current assets", normal: "debit",
    note: "Watches held, valued at cost" },
  { code: "1200", name: "Sundry debtors", kind: "asset", group: "Current assets", normal: "debit",
    note: "Customers who have not yet paid" },
  { code: "1300", name: "Input GST", kind: "asset", group: "Current assets", normal: "debit",
    note: "GST paid on purchases, claimable" },

  // Liabilities
  { code: "2000", name: "Sundry creditors", kind: "liability", group: "Current liabilities", normal: "credit",
    note: "Suppliers not yet paid" },
  { code: "2100", name: "Output GST", kind: "liability", group: "Current liabilities", normal: "credit",
    note: "GST charged on sales, payable" },

  // Equity
  { code: "3000", name: "Capital account", kind: "equity", group: "Capital", normal: "credit" },
  { code: "3100", name: "Drawings", kind: "equity", group: "Capital", normal: "debit",
    note: "Money taken out by the proprietor" },

  // Income
  { code: "4000", name: "Sales", kind: "income", group: "Revenue", normal: "credit" },
  { code: "4100", name: "Discount allowed", kind: "expense", group: "Direct costs", normal: "debit",
    note: "Given at the counter, off list price" },

  // Costs
  { code: "5000", name: "Cost of goods sold", kind: "expense", group: "Direct costs", normal: "debit" },
  { code: "5100", name: "Rent", kind: "expense", group: "Operating expenses", normal: "debit" },
  { code: "5200", name: "Salaries & wages", kind: "expense", group: "Operating expenses", normal: "debit" },
  { code: "5300", name: "Electricity & utilities", kind: "expense", group: "Operating expenses", normal: "debit" },
  { code: "5400", name: "Software & subscriptions", kind: "expense", group: "Operating expenses", normal: "debit",
    note: "Includes the listing agent's model usage" },
  { code: "5500", name: "Repairs & servicing", kind: "expense", group: "Operating expenses", normal: "debit" },
  { code: "5900", name: "Other expenses", kind: "expense", group: "Operating expenses", normal: "debit" },
];

export const BY_CODE = new Map(ACCOUNTS.map((account) => [account.code, account]));

export const CODES = {
  cash: "1000",
  bank: "1010",
  stock: "1100",
  debtors: "1200",
  inputGst: "1300",
  creditors: "2000",
  outputGst: "2100",
  capital: "3000",
  drawings: "3100",
  sales: "4000",
  discount: "4100",
  cogs: "5000",
  software: "5400",
} as const;

/** Where a payment method lands in the books. */
export function accountForPayment(payment: string): string {
  if (payment === "cash") return CODES.cash;
  if (payment === "card" || payment === "upi" || payment === "bank") return CODES.bank;
  return CODES.debtors;
}

export function accountName(code: string): string {
  return BY_CODE.get(code)?.name ?? code;
}
