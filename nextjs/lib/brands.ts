/**
 * Brands, derived from the catalogue.
 *
 * The shop never maintains a list of brands: whatever the agent has ingested is
 * what the site shows. A brand appears the moment its first reference is
 * published and disappears when its last one is sold through and delisted.
 *
 * `data/brand-notes.json` exists only to say the things a spreadsheet cannot — a
 * house line, a founding year, a wordmark file, where the brand sits in the rail.
 * Every field is optional, so a brand nobody has written copy for still renders.
 *
 * Named "brand-notes" rather than "brands": the agent keeps its own registry of
 * official brand websites at data/brands.json and rewrites it after every run,
 * which would silently eat this file.
 */
import "server-only";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getCatalogIndex, PUBLISHED_STATUS } from "./catalog";
import type { CatalogEntry } from "@/agent/types";

/** Editable per-brand copy. Everything optional — the catalogue supplies the rest. */
const BrandNoteSchema = z.object({
  slug: z.string(),
  /** Overrides the spelling the sheet used, e.g. "G-SHOCK" over "G SHOCK". */
  name: z.string().optional(),
  /** One line, shown under the wordmark on the brand page. */
  tagline: z.string().optional(),
  /** A paragraph for the brand page. */
  blurb: z.string().optional(),
  since: z.number().int().optional(),
  /** Path to a wordmark, e.g. "/brands/casio.svg". Falls back to set type. */
  logo: z.string().optional(),
  /**
   * A badge the shop controls — "New in", "Exclusive". Deliberately manual:
   * a claim like that is a merchandising decision, not something to infer.
   */
  badge: z.string().optional(),
  /** Lower sorts first; unordered brands follow, by stock held. */
  order: z.number().optional(),
});

export type BrandNote = z.infer<typeof BrandNoteSchema>;

export interface BrandSummary {
  slug: string;
  /** Display name, as the shop spells it. */
  name: string;
  tagline: string | null;
  blurb: string | null;
  since: number | null;
  logo: string | null;
  /** Shop-set badge, or "Reduced" when something in the range is discounted. */
  badge: string | null;
  /** Published references carried. */
  count: number;
  inStock: number;
  reduced: number;
  priceFrom: number | null;
  /** A representative photograph — the cheapest in-stock piece that has one. */
  image: string | null;
  backdropId: string | null;
}

/** "G-Shock Master of G" → "g-shock-master-of-g". */
export function brandSlug(brand: string): string {
  return brand
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function readNotes(): Promise<Map<string, BrandNote>> {
  try {
    const raw = JSON.parse(await fs.readFile(join(process.cwd(), "data", "brand-notes.json"), "utf8"));
    const parsed = z.array(BrandNoteSchema).safeParse(raw);
    if (!parsed.success) return new Map();
    return new Map(parsed.data.map((note) => [note.slug, note]));
  } catch {
    // No file, or a broken one. Brands still render from the catalogue alone.
    return new Map();
  }
}

function summarise(brand: string, entries: CatalogEntry[], note: BrandNote | undefined): BrandSummary {
  const inStock = entries.filter((entry) => entry.inStock);
  const reduced = entries.filter((entry) => (entry.price.discountPct ?? 0) > 0);

  // The cheapest in-stock piece that has a photograph, so the rail and the brand
  // index lead with something the customer can actually walk in and buy.
  const shot =
    [...inStock]
      .sort((a, b) => (a.price.selling ?? Infinity) - (b.price.selling ?? Infinity))
      .find((entry) => entry.image) ?? entries.find((entry) => entry.image);

  // "From ₹x" can only be worked out from watches that have a price.
  const priced = (inStock.length ? inStock : entries)
    .map((entry) => entry.price.selling)
    .filter((value): value is number => value !== null);

  return {
    slug: brandSlug(brand),
    name: note?.name ?? brand,
    tagline: note?.tagline ?? null,
    blurb: note?.blurb ?? null,
    since: note?.since ?? null,
    logo: note?.logo ?? null,
    // A shop-set badge wins; otherwise the only claim made is one the prices prove.
    badge: note?.badge ?? (reduced.length > 0 ? "Reduced" : null),
    count: entries.length,
    inStock: inStock.length,
    reduced: reduced.length,
    priceFrom: priced.length ? Math.min(...priced) : null,
    image: shot?.image?.url ?? null,
    backdropId: shot?.backdropId ?? null,
  };
}

/** Every brand with something published, richest stock first unless ordered. */
export async function getBrands(): Promise<BrandSummary[]> {
  const [index, notes] = await Promise.all([getCatalogIndex(), readNotes()]);
  const published = index.filter((entry) => entry.status === PUBLISHED_STATUS);

  const grouped = new Map<string, CatalogEntry[]>();
  for (const entry of published) {
    const key = entry.brand.trim();
    if (!key) continue;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(entry);
    else grouped.set(key, [entry]);
  }

  const summaries = [...grouped.entries()].map(([brand, entries]) =>
    summarise(brand, entries, notes.get(brandSlug(brand))),
  );

  const orderOf = (summary: BrandSummary) => notes.get(summary.slug)?.order ?? Number.MAX_SAFE_INTEGER;

  return summaries.sort(
    (a, b) => orderOf(a) - orderOf(b) || b.inStock - a.inStock || a.name.localeCompare(b.name),
  );
}

export async function getBrand(slug: string): Promise<BrandSummary | null> {
  const wanted = slug.toLowerCase();
  return (await getBrands()).find((brand) => brand.slug === wanted) ?? null;
}

/**
 * The catalogue's own spelling of a brand, for filtering.
 *
 * Filters match on the brand string the sheet used, which is not always the name
 * shown — so a slug has to be resolved back before the grid can be narrowed.
 */
export async function brandNameForSlug(slug: string): Promise<string | null> {
  const wanted = slug.toLowerCase();
  const index = await getCatalogIndex();
  for (const entry of index) {
    if (brandSlug(entry.brand) === wanted) return entry.brand;
  }
  return null;
}
