/**
 * The journal: every entry the books are built from.
 *
 * Append-only by design. Nothing here is ever edited or deleted — a mistake is
 * corrected by posting a reversing entry, which is what leaves an audit trail
 * worth the name. Every report in the stock room is derived from this file, so
 * the day book, the trial balance and the balance sheet cannot disagree with one
 * another: they are three readings of the same ledger.
 *
 * Each entry must balance to the paisa before it is written. An unbalanced
 * journal is not a warning to show later, it is a bug to refuse now.
 */
import "server-only";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { loadConfig } from "@/agent/config";

const config = loadConfig();
const JOURNAL_PATH = join(config.dataDir, "..", "journal.json");

export const VOUCHER_TYPES = ["sale", "purchase", "payment", "receipt", "expense", "journal", "opening"] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];

export const EntryLineSchema = z.object({
  account: z.string(),
  debit: z.number().nonnegative().default(0),
  credit: z.number().nonnegative().default(0),
  note: z.string().default(""),
});

export const EntrySchema = z.object({
  id: z.string(),
  /** Date of the transaction, which is not always the date it was entered. */
  date: z.string(),
  type: z.enum(VOUCHER_TYPES),
  voucherNo: z.string(),
  narration: z.string(),
  lines: z.array(EntryLineSchema).min(2),
  /** Bill number, supplier invoice, run id — whatever the entry stands for. */
  reference: z.string().default(""),
  party: z.string().default(""),
  createdAt: z.string(),
  demo: z.boolean().default(false),
});
export type Entry = z.infer<typeof EntrySchema>;
export type EntryLine = z.infer<typeof EntryLineSchema>;

const round2 = (value: number) => Math.round(value * 100) / 100;

export async function readJournal(): Promise<Entry[]> {
  try {
    const raw = JSON.parse(await fs.readFile(JOURNAL_PATH, "utf8"));
    const parsed = z.array(EntrySchema).safeParse(raw);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

async function writeJournal(entries: Entry[]): Promise<void> {
  await fs.mkdir(join(JOURNAL_PATH, ".."), { recursive: true });
  await fs.writeFile(JOURNAL_PATH, `${JSON.stringify(entries, null, 2)}\n`);
}

export interface DraftEntry {
  date: string;
  type: VoucherType;
  narration: string;
  lines: Array<{ account: string; debit?: number; credit?: number; note?: string }>;
  reference?: string;
  party?: string;
  demo?: boolean;
}

export class UnbalancedEntry extends Error {}

/** Next voucher number for a type, per financial year — Busy's convention. */
function voucherNumber(entries: Entry[], type: VoucherType, date: Date): string {
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  const fy = `${String(year).slice(2)}${String((year + 1) % 100).padStart(2, "0")}`;
  const prefix = { sale: "S", purchase: "P", payment: "PY", receipt: "R", expense: "E", journal: "J", opening: "OP" }[type];
  const count = entries.filter((entry) => entry.type === type && entry.voucherNo.includes(fy)).length;
  return `${prefix}/${fy}/${String(count + 1).padStart(4, "0")}`;
}

/**
 * Posts one or more entries, refusing any that does not balance.
 *
 * Entries are posted as a batch so a sale that moves stock as well as money is
 * either wholly in the books or wholly absent — never half-recorded.
 */
export async function post(drafts: DraftEntry[]): Promise<Entry[]> {
  if (!drafts.length) return [];
  const existing = await readJournal();
  const written: Entry[] = [];

  for (const draft of drafts) {
    const lines: EntryLine[] = draft.lines
      .map((line) => ({
        account: line.account,
        debit: round2(line.debit ?? 0),
        credit: round2(line.credit ?? 0),
        note: line.note ?? "",
      }))
      // A zero line carries no information and clutters a printed ledger.
      .filter((line) => line.debit > 0 || line.credit > 0);

    const debits = round2(lines.reduce((sum, line) => sum + line.debit, 0));
    const credits = round2(lines.reduce((sum, line) => sum + line.credit, 0));

    // Tolerance of half a paisa absorbs float noise without hiding a real error.
    if (Math.abs(debits - credits) > 0.005) {
      throw new UnbalancedEntry(
        `${draft.type} "${draft.narration}" does not balance: debits ${debits}, credits ${credits}.`,
      );
    }
    if (lines.length < 2) throw new UnbalancedEntry(`${draft.type} "${draft.narration}" needs at least two lines.`);

    const date = new Date(draft.date);
    const all = [...existing, ...written];
    written.push({
      id: `je_${Date.now().toString(36)}_${all.length}`,
      date: draft.date,
      type: draft.type,
      voucherNo: voucherNumber(all, draft.type, date),
      narration: draft.narration,
      lines,
      reference: draft.reference ?? "",
      party: draft.party ?? "",
      createdAt: new Date().toISOString(),
      demo: draft.demo ?? false,
    });
  }

  await writeJournal([...existing, ...written].sort((a, b) => a.date.localeCompare(b.date)));
  return written;
}

/** Removes only demo postings, for the same reason demo bills are removable. */
export async function purgeDemo(): Promise<number> {
  const entries = await readJournal();
  const kept = entries.filter((entry) => !entry.demo);
  await writeJournal(kept);
  return entries.length - kept.length;
}

export interface AccountBalance {
  code: string;
  debit: number;
  credit: number;
  /** Signed by the account's normal side: positive means a normal balance. */
  balance: number;
}

/** Sums the journal into per-account balances, optionally up to a date. */
export async function balances(upto?: string, from?: string): Promise<Map<string, AccountBalance>> {
  const entries = await readJournal();
  const totals = new Map<string, AccountBalance>();

  for (const entry of entries) {
    if (upto && entry.date > upto) continue;
    if (from && entry.date < from) continue;
    for (const line of entry.lines) {
      const current = totals.get(line.account) ?? { code: line.account, debit: 0, credit: 0, balance: 0 };
      current.debit = round2(current.debit + line.debit);
      current.credit = round2(current.credit + line.credit);
      totals.set(line.account, current);
    }
  }

  for (const total of totals.values()) total.balance = round2(total.debit - total.credit);
  return totals;
}

export async function ledgerFor(code: string, from?: string, upto?: string): Promise<Array<Entry & { line: EntryLine; running: number }>> {
  const entries = await readJournal();
  const rows: Array<Entry & { line: EntryLine; running: number }> = [];
  let running = 0;

  for (const entry of entries) {
    if (from && entry.date < from) continue;
    if (upto && entry.date > upto) continue;
    for (const line of entry.lines) {
      if (line.account !== code) continue;
      running = round2(running + line.debit - line.credit);
      rows.push({ ...entry, line, running });
    }
  }
  return rows;
}
