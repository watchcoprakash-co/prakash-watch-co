/**
 * Billing.
 *
 * A bill is the only thing in this system that creates revenue, so it is also
 * what makes the analytics real: until a watch is billed there is nothing to
 * report but stock. Writing one does three things at once — records the sale,
 * takes the units out of stock through the ledger, and therefore moves every
 * figure on the overview.
 *
 * Prices are captured onto the bill at the moment of sale. A bill is a record of
 * what was actually charged, so a later price change in the catalogue must never
 * rewrite history.
 */
import "server-only";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { loadConfig } from "@/agent/config";
import { getProduct, updateProduct } from "@/lib/catalog";
import { appendMovements } from "@/lib/ledger";

const config = loadConfig();
const BILLS_DIR = join(config.dataDir, "..", "bills");

/** Watches attract 18% GST in India; kept per-bill so a change is never retroactive. */
export const DEFAULT_GST_RATE = 18;

export const BillLineSchema = z.object({
  sku: z.string(),
  title: z.string(),
  modelNumber: z.string(),
  quantity: z.number().int().positive(),
  /** Charged before tax, per unit, after any discount given at the counter. */
  unitPrice: z.number().nonnegative(),
  /** What the catalogue listed, kept so the discount given is visible later. */
  listPrice: z.number().nonnegative(),
});
export type BillLine = z.infer<typeof BillLineSchema>;

export const BillSchema = z.object({
  id: z.string(),
  number: z.string(),
  issuedAt: z.string(),
  customer: z.object({
    name: z.string(),
    phone: z.string().default(""),
    email: z.string().default(""),
    address: z.string().default(""),
  }),
  lines: z.array(BillLineSchema).min(1),
  gstRate: z.number().min(0).max(50),
  /** Rupee amounts, all exclusive of tax except `total`. */
  subtotal: z.number(),
  discount: z.number(),
  taxable: z.number(),
  gstAmount: z.number(),
  total: z.number(),
  payment: z.enum(["cash", "card", "upi", "bank", "other"]),
  note: z.string().default(""),
  status: z.enum(["paid", "void"]).default("paid"),
  /**
   * Generated sample data, not a real sale. Marked rather than hidden so it can
   * never be mistaken for takings, and so `npm run demo:purge` can lift all of it
   * out again in one go.
   */
  demo: z.boolean().default(false),
});
export type Bill = z.infer<typeof BillSchema>;

export const BillDraftSchema = z.object({
  customer: z.object({
    name: z.string().min(1, "Customer name is required"),
    phone: z.string().max(20).default(""),
    email: z.string().max(120).default(""),
    address: z.string().max(300).default(""),
  }),
  lines: z
    .array(
      z.object({
        sku: z.string().min(1),
        quantity: z.number().int().positive().max(99),
        unitPrice: z.number().nonnegative(),
      }),
    )
    .min(1, "Add at least one watch"),
  gstRate: z.number().min(0).max(50).default(DEFAULT_GST_RATE),
  payment: z.enum(["cash", "card", "upi", "bank", "other"]).default("cash"),
  note: z.string().max(500).default(""),
});
export type BillDraft = z.infer<typeof BillDraftSchema>;

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Indian financial year, which is what an invoice number is expected to carry. */
function financialYear(date: Date): string {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export async function listBills(): Promise<Bill[]> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(BILLS_DIR)).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }

  const bills: Bill[] = [];
  for (const file of files) {
    try {
      const parsed = BillSchema.safeParse(JSON.parse(await fs.readFile(join(BILLS_DIR, file), "utf8")));
      if (parsed.success) bills.push(parsed.data);
    } catch {
      // A malformed bill must not hide the rest of the ledger.
    }
  }
  return bills.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

export async function getBill(id: string): Promise<Bill | null> {
  if (!/^[a-z0-9_-]+$/i.test(id)) return null;
  try {
    const parsed = BillSchema.safeParse(JSON.parse(await fs.readFile(join(BILLS_DIR, `${id}.json`), "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function nextNumber(): Promise<string> {
  const now = new Date();
  const year = financialYear(now);
  const count = (await listBills()).filter((bill) => bill.number.includes(year)).length;
  return `PWC/${year}/${String(count + 1).padStart(4, "0")}`;
}

export interface BillResult {
  bill: Bill | null;
  errors: string[];
}

/**
 * Writes a bill, takes the stock out, and returns what was created.
 *
 * Stock is checked before anything is written: selling a watch the shop does not
 * have is the one mistake a till must not make quietly.
 */
export async function createBill(draft: BillDraft): Promise<BillResult> {
  const errors: string[] = [];
  const lines: BillLine[] = [];

  for (const line of draft.lines) {
    const product = await getProduct(line.sku);
    if (!product) {
      errors.push(`${line.sku} is not in the catalogue.`);
      continue;
    }
    const available = product.quantity ?? 0;
    if (available < line.quantity) {
      errors.push(`${product.title}: only ${available} in stock, ${line.quantity} requested.`);
      continue;
    }
    // A watch catalogued from a brand master has no price yet, so there is no
    // list price to record against the sale and nothing to strike through.
    if (product.price.selling === null) {
      errors.push(`${product.title} has no price set. Price it before it can be billed.`);
      continue;
    }
    lines.push({
      sku: product.sku,
      title: product.title,
      modelNumber: product.modelNumber,
      quantity: line.quantity,
      unitPrice: round2(line.unitPrice),
      listPrice: product.price.selling,
    });
  }

  if (errors.length) return { bill: null, errors };
  if (!lines.length) return { bill: null, errors: ["Nothing to bill."] };

  const listTotal = lines.reduce((sum, line) => sum + line.listPrice * line.quantity, 0);
  const taxable = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const gstAmount = round2((taxable * draft.gstRate) / 100);

  const now = new Date();
  const bill: Bill = {
    id: `bill_${now.getTime().toString(36)}`,
    number: await nextNumber(),
    issuedAt: now.toISOString(),
    customer: draft.customer,
    lines,
    gstRate: draft.gstRate,
    subtotal: round2(listTotal),
    discount: round2(Math.max(0, listTotal - taxable)),
    taxable: round2(taxable),
    gstAmount,
    total: round2(taxable + gstAmount),
    payment: draft.payment,
    note: draft.note,
    status: "paid",
    // Written at the counter, so never sample data.
    demo: false,
  };

  await fs.mkdir(BILLS_DIR, { recursive: true });
  await fs.writeFile(join(BILLS_DIR, `${bill.id}.json`), `${JSON.stringify(bill, null, 2)}\n`);

  // Take the stock out only once the bill is safely on disk.
  await appendMovements(
    lines.map((line) => ({
      sku: line.sku,
      kind: "sale" as const,
      delta: -line.quantity,
      reference: bill.number,
      note: draft.customer.name,
    })),
  );

  for (const line of lines) {
    const product = await getProduct(line.sku);
    if (!product) continue;
    const remaining = Math.max(0, (product.quantity ?? 0) - line.quantity);
    await updateProduct(line.sku, { quantity: remaining, inStock: remaining > 0 });
  }

  return { bill, errors: [] };
}
