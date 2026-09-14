/**
 * The price watch, as the stock room reads it.
 *
 * The agent writes `data/price-watch.json` and changes nothing. This module reads
 * it back, and applies an MRP correction only when a person asks for that one.
 *
 * MRP and selling price are treated as different kinds of fact throughout. The
 * list price belongs to the brand, so a movement in it is a correction. What the
 * shop charges belongs to the shop, and no sweep of the internet is allowed to
 * touch it — the most this can do is say what others are asking.
 */
import "server-only";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { ReportSchema, type PriceReport } from "./pricing.shared";

const FILE = join(process.cwd(), "data", "price-watch.json");

// Shape and labels live in pricing.shared so the price desk — a client component,
// which cannot import anything server-only — shares them.
export { VERDICTS, VERDICT_LABELS } from "./pricing.shared";
export type { Verdict, PriceQuote, PriceFinding, PriceReport } from "./pricing.shared";

/** The last sweep, or null if none has been run. */
export async function getPriceWatch(): Promise<PriceReport | null> {
  try {
    const parsed = ReportSchema.safeParse(JSON.parse(await fs.readFile(FILE, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Marks one finding as dealt with, so the queue shrinks as it is worked through.
 *
 * The finding is kept rather than deleted: knowing that a proposal was looked at
 * and declined is worth as much as knowing it was applied.
 */
export async function settleFinding(sku: string, outcome: "applied" | "dismissed"): Promise<PriceReport | null> {
  const report = await getPriceWatch();
  if (!report) return null;

  const finding = report.findings.find((f) => f.sku === sku);
  if (!finding) return null;

  finding.suggestedMrp = null;
  finding.verdict = outcome === "applied" ? "unchanged" : finding.verdict;
  finding.note =
    outcome === "applied"
      ? `Applied on ${new Date().toISOString().slice(0, 10)}. ${finding.note}`
      : `Left as it is on ${new Date().toISOString().slice(0, 10)}. ${finding.note}`;

  report.proposals = report.findings.filter((f) => f.suggestedMrp !== null).length;
  await fs.writeFile(FILE, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
