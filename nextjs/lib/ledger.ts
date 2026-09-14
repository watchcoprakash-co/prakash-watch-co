/**
 * The stock ledger.
 *
 * Every change in stock is written here as an entry rather than by overwriting a
 * number, so the shop can always answer "why does it say three?" — the agent
 * brought stock in, a bill took one out, someone counted the drawer and corrected
 * it. Current stock is the sum of the movements, which means a wrong entry is
 * corrected by adding another, never by quietly editing history.
 */
import "server-only";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { loadConfig } from "@/agent/config";

const config = loadConfig();
const LEDGER_PATH = join(config.dataDir, "..", "stock-ledger.json");

export const MovementSchema = z.object({
  id: z.string(),
  sku: z.string(),
  /** ingest = the agent read it from a sheet; sale = billed; adjustment = counted. */
  kind: z.enum(["ingest", "sale", "adjustment", "return"]),
  /** Signed: negative removes stock. */
  delta: z.number().int(),
  at: z.string(),
  /** Bill number, run id, or whoever adjusted it. */
  reference: z.string().default(""),
  note: z.string().default(""),
});
export type Movement = z.infer<typeof MovementSchema>;

export async function readLedger(): Promise<Movement[]> {
  try {
    const raw = JSON.parse(await fs.readFile(LEDGER_PATH, "utf8"));
    const parsed = z.array(MovementSchema).safeParse(raw);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function appendMovements(entries: Omit<Movement, "id" | "at">[]): Promise<Movement[]> {
  const existing = await readLedger();
  const stamped: Movement[] = entries.map((entry, index) => ({
    ...entry,
    id: `mv_${Date.now().toString(36)}${index}`,
    at: new Date().toISOString(),
    reference: entry.reference ?? "",
    note: entry.note ?? "",
  }));

  const next = [...existing, ...stamped];
  await fs.mkdir(join(LEDGER_PATH, ".."), { recursive: true });
  await fs.writeFile(LEDGER_PATH, `${JSON.stringify(next, null, 2)}\n`);
  return stamped;
}

/** Net movement per sku, used to reconcile against the catalogue's own count. */
export async function movementTotals(): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  for (const entry of await readLedger()) {
    totals.set(entry.sku, (totals.get(entry.sku) ?? 0) + entry.delta);
  }
  return totals;
}

export async function movementsFor(sku: string): Promise<Movement[]> {
  return (await readLedger()).filter((entry) => entry.sku === sku).reverse();
}
