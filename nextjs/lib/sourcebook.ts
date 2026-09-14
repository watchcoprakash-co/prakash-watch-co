/**
 * The source book, as the stock room reads it.
 *
 * The agent appends one line per watch per run to `data/model-sources.jsonl`.
 * This collapses that history into a current view: one record per reference, with
 * every page ever read for it and what each one actually gave.
 *
 * Kept separate from the catalogue on purpose. A listing can be edited, delisted
 * or sold through; the question "where did we get this specification, and when"
 * has to remain answerable afterwards.
 */
import "server-only";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { ModelRecord, PublisherTally } from "./sourcebook.shared";

const FILE = join(process.cwd(), "data", "model-sources.jsonl");

const SourceSchema = z.object({
  url: z.string(),
  publisher: z.string().default(""),
  kind: z.string().default("other"),
  title: z.string().default(""),
  fetchedAt: z.string().default(""),
  gaveSpecs: z.number().default(0),
  gaveImages: z.number().default(0),
});

const LineSchema = z.object({
  sku: z.string(),
  brand: z.string(),
  modelNumber: z.string(),
  title: z.string().default(""),
  runId: z.string().default(""),
  at: z.string().default(""),
  status: z.string().default(""),
  matchConfidence: z.number().default(0),
  sources: z.array(SourceSchema).default([]),
  imageSources: z.array(z.string()).default([]),
});

// The shape lives in sourcebook.shared so the reader — a client component, which
// cannot import anything server-only — shares it.
export type { SourceEntry, ModelRecord, PublisherTally } from "./sourcebook.shared";

async function readLines(): Promise<z.infer<typeof LineSchema>[]> {
  let raw: string;
  try {
    raw = await fs.readFile(FILE, "utf8");
  } catch {
    return [];
  }

  const out: z.infer<typeof LineSchema>[] = [];
  for (const line of raw.split("\n")) {
    const text = line.trim();
    if (!text) continue;
    try {
      const parsed = LineSchema.safeParse(JSON.parse(text));
      if (parsed.success) out.push(parsed.data);
    } catch {
      // A truncated final line is normal if a run was interrupted mid-append.
    }
  }
  return out;
}

/**
 * One record per reference, newest run's metadata, union of every source seen.
 *
 * The union matters: a re-run that happened to find three pages should not erase
 * the fourth that answered last month and has since gone offline.
 */
export async function getSourceBook(listedSkus?: Set<string>): Promise<ModelRecord[]> {
  const lines = await readLines();
  const byModel = new Map<string, ModelRecord>();

  for (const line of lines) {
    const key = `${line.brand.toLowerCase()}|${line.modelNumber.toLowerCase()}`;
    const existing = byModel.get(key);

    if (!existing) {
      byModel.set(key, {
        sku: line.sku,
        brand: line.brand,
        modelNumber: line.modelNumber,
        title: line.title,
        firstSeen: line.at,
        lastSeen: line.at,
        runs: 1,
        status: line.status,
        matchConfidence: line.matchConfidence,
        sources: [...line.sources],
        imageSources: [...line.imageSources],
        stillListed: listedSkus ? listedSkus.has(line.sku) : true,
      });
      continue;
    }

    // Lines arrive oldest first, so the later one always wins for current state.
    existing.runs += 1;
    existing.lastSeen = line.at;
    existing.status = line.status;
    existing.title = line.title || existing.title;
    existing.matchConfidence = line.matchConfidence;

    const seen = new Set(existing.sources.map((source) => source.url));
    for (const source of line.sources) {
      if (seen.has(source.url)) {
        // Refresh what it gave and when, keeping the record current.
        const previous = existing.sources.find((s) => s.url === source.url)!;
        previous.fetchedAt = source.fetchedAt || previous.fetchedAt;
        previous.gaveSpecs = Math.max(previous.gaveSpecs, source.gaveSpecs);
        previous.gaveImages = Math.max(previous.gaveImages, source.gaveImages);
      } else {
        existing.sources.push(source);
        seen.add(source.url);
      }
    }

    for (const url of line.imageSources) {
      if (!existing.imageSources.includes(url)) existing.imageSources.push(url);
    }
  }

  return [...byModel.values()].sort(
    (a, b) => a.brand.localeCompare(b.brand) || a.modelNumber.localeCompare(b.modelNumber),
  );
}

/** Which publishers are actually earning their place, across the whole book. */
export function tallyPublishers(records: ModelRecord[]): PublisherTally[] {
  const map = new Map<string, PublisherTally>();
  for (const record of records) {
    for (const source of record.sources) {
      const key = source.publisher || "(unknown)";
      const entry = map.get(key) ?? { publisher: key, models: 0, specs: 0, images: 0, kind: source.kind };
      entry.models += 1;
      entry.specs += source.gaveSpecs;
      entry.images += source.gaveImages;
      // Official beats any other label the same host might carry elsewhere.
      if (source.kind === "official") entry.kind = "official";
      map.set(key, entry);
    }
  }
  return [...map.values()].sort((a, b) => b.specs - a.specs || b.models - a.models);
}
