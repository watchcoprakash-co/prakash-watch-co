/**
 * Server-side access to the catalog the agent produces.
 *
 * Artifacts on disk are the single source of truth: the agent writes them, the
 * admin panel edits them, the storefront reads them. Nothing here runs in the
 * browser.
 */
import "server-only";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { loadConfig, COLLECTION_META, type CollectionId } from "@/agent/config";
import {
  BackdropSchema,
  CatalogEntrySchema,
  WatchProductSchema,
  type Backdrop,
  type CatalogEntry,
  type WatchProduct,
} from "@/agent/types";
import type { RunReport } from "@/agent/types";

const config = loadConfig();

/** Only `ready` listings are visible to shoppers; everything else awaits review. */
export const PUBLISHED_STATUS = "ready" as const;

export async function getAllProducts(): Promise<WatchProduct[]> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(config.dataDir)).filter((name) => name.endsWith(".json") && name !== "index.json");
  } catch {
    return [];
  }

  const products: WatchProduct[] = [];
  for (const file of files) {
    try {
      const parsed = WatchProductSchema.safeParse(JSON.parse(await fs.readFile(join(config.dataDir, file), "utf8")));
      if (parsed.success) products.push(parsed.data);
    } catch {
      // A corrupt artifact must not take down the shop.
    }
  }

  products.sort((a, b) => a.brand.localeCompare(b.brand) || a.title.localeCompare(b.title));
  return products;
}

export async function getProduct(sku: string): Promise<WatchProduct | null> {
  // Guard against path traversal via the URL segment.
  if (!/^[a-z0-9-]+$/i.test(sku)) return null;
  try {
    const raw = await fs.readFile(join(config.dataDir, `${sku}.json`), "utf8");
    const parsed = WatchProductSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function getPublishedProducts(): Promise<WatchProduct[]> {
  return (await getAllProducts()).filter((product) => product.status === PUBLISHED_STATUS);
}

export interface CollectionSummary {
  id: CollectionId;
  no: string;
  name: string;
  note: string;
  count: number;
  /** Primary image of the newest listing, used for the homepage hover peek. */
  image: string | null;
}

/** The six families the homepage renders, with live counts and a real photograph. */
export async function getCollectionSummaries(): Promise<CollectionSummary[]> {
  const products = await getPublishedProducts();

  return (Object.keys(COLLECTION_META) as CollectionId[]).map((id) => {
    const inFamily = products.filter((product) => product.collection === id);
    const withImage = inFamily.find((product) => product.images.length > 0);
    return {
      id,
      ...COLLECTION_META[id],
      count: inFamily.length,
      image: withImage?.images[0]?.url ?? null,
    };
  });
}

export async function getCatalogIndex(): Promise<CatalogEntry[]> {
  try {
    return JSON.parse(await fs.readFile(join(config.dataDir, "index.json"), "utf8")) as CatalogEntry[];
  } catch {
    return [];
  }
}

/**
 * The generated backdrop library, keyed by id.
 *
 * Backdrops are written once by the agent and shared by every listing that suits
 * them, so restyling the whole catalogue means regenerating six files rather than
 * reprocessing every photograph.
 */
export async function getBackdrops(): Promise<Map<string, Backdrop>> {
  try {
    const raw = JSON.parse(await fs.readFile(join(config.dataDir, "..", "backdrops.json"), "utf8"));
    const parsed = z.array(BackdropSchema).safeParse(raw);
    if (!parsed.success) return new Map();
    return new Map(parsed.data.map((backdrop) => [backdrop.id, backdrop]));
  } catch {
    return new Map();
  }
}

/** Ingestion run reports, newest first. */
export async function getRuns(limit = 10): Promise<RunReport[]> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(config.reportDir)).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }

  files.sort().reverse();
  const runs: RunReport[] = [];
  for (const file of files.slice(0, limit)) {
    try {
      runs.push(JSON.parse(await fs.readFile(join(config.reportDir, file), "utf8")) as RunReport);
    } catch {
      // Skip unreadable reports.
    }
  }
  return runs;
}

/**
 * Rebuilds the compact index the collections page reads.
 *
 * The Python agent writes this after every run; this copy exists so an admin edit
 * updates the shop immediately without re-running the agent.
 */
export async function rebuildIndex(): Promise<CatalogEntry[]> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(config.dataDir)).filter((name) => name.endsWith(".json") && name !== "index.json");
  } catch {
    return [];
  }

  const entries: CatalogEntry[] = [];
  for (const file of files) {
    try {
      const parsed = WatchProductSchema.safeParse(JSON.parse(await fs.readFile(join(config.dataDir, file), "utf8")));
      if (!parsed.success) continue;
      const value = parsed.data;
      entries.push(
        CatalogEntrySchema.parse({
          sku: value.sku,
          slug: value.slug,
          status: value.status,
          brand: value.brand,
          modelNumber: value.modelNumber,
          modelName: value.modelName,
          title: value.title,
          price: value.price,
          collection: value.collection,
          gender: value.gender,
          inStock: value.inStock,
          backdropId: value.backdropId,
          // Carried across explicitly. Both have schema defaults, so omitting them
          // does not fail — it silently writes an empty facet set, which blanks
          // the sidebar filters for every watch the next time anyone saves an edit.
          facets: value.facets,
          tags: value.tags,
          image: value.images[0] ?? null,
          tagline: value.copy.tagline,
        }),
      );
    } catch {
      // A corrupt artifact must not break the shop.
    }
  }

  entries.sort((a, b) => a.brand.localeCompare(b.brand) || a.title.localeCompare(b.title));
  await fs.writeFile(join(config.dataDir, "index.json"), `${JSON.stringify(entries, null, 2)}\n`);
  return entries;
}

/** Fields the admin panel is allowed to change. */
export const ProductPatchSchema = z.object({
  status: z.enum(["ready", "needs_review"]).optional(),
  title: z.string().min(1).max(140).optional(),
  modelName: z.string().max(140).nullable().optional(),
  collection: z.enum(Object.keys(COLLECTION_META) as [CollectionId, ...CollectionId[]]).nullable().optional(),
  gender: z.enum(["men", "women", "unisex"]).nullable().optional(),
  inStock: z.boolean().optional(),
  quantity: z.number().int().nonnegative().nullable().optional(),
  price: z
    .object({
      selling: z.number().positive(),
      mrp: z.number().positive().nullable(),
    })
    .optional(),
  copy: z
    .object({
      tagline: z.string().max(140),
      short: z.string().max(400),
      long: z.string().max(4000),
      bullets: z.array(z.string().max(200)).max(8),
      seoTitle: z.string().max(140),
      seoDescription: z.string().max(400),
    })
    .partial()
    .optional(),
  /** Image URLs to keep, in display order. The first becomes the primary shot. */
  imageOrder: z.array(z.string()).optional(),
  /** Backdrop to place the cut-out watch on. Null leaves it as photographed. */
  backdropId: z.string().max(40).nullable().optional(),
  /**
   * The specification sheet, rewritten by hand.
   *
   * Research gets most of this right and occasionally gets one line wrong, which
   * on a spec sheet is worse than leaving it blank — so the shop can correct any
   * row. An edited row loses its source index: it is now the shop's word, not a
   * citation, and the listing should not claim otherwise.
   */
  specs: z
    .array(
      z.object({
        label: z.string().min(1).max(60),
        value: z.string().min(1).max(300),
        group: z.string().max(40).default("Specification"),
      }),
    )
    .max(60)
    .optional(),
  /** The readable attributes shown on the watch page. */
  attributes: z
    .object({
      movement: z.string().max(80).nullable(),
      caliber: z.string().max(80).nullable(),
      caseMaterial: z.string().max(80).nullable(),
      caseDiameterMm: z.number().min(0).max(100).nullable(),
      crystal: z.string().max(80).nullable(),
      dialColour: z.string().max(60).nullable(),
      strapMaterial: z.string().max(80).nullable(),
      waterResistance: z.string().max(60).nullable(),
      warranty: z.string().max(120).nullable(),
    })
    .partial()
    .optional(),
  /** The controlled values the sidebar filters on. */
  facets: z
    .object({
      movement: z.string().max(30).nullable(),
      caseMaterial: z.string().max(30).nullable(),
      strap: z.string().max(30).nullable(),
      dialColour: z.string().max(30).nullable(),
      waterResistance: z.string().max(10).nullable(),
      caseSize: z.string().max(20).nullable(),
    })
    .partial()
    .optional(),
});

export type ProductPatch = z.infer<typeof ProductPatchSchema>;

/**
 * Applies an admin edit to an artifact and rebuilds the storefront index.
 * Returns null when the sku does not exist.
 */
export async function updateProduct(sku: string, patch: ProductPatch): Promise<WatchProduct | null> {
  const product = await getProduct(sku);
  if (!product) return null;

  const next: WatchProduct = {
    ...product,
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.modelName !== undefined ? { modelName: patch.modelName } : {}),
    ...(patch.collection !== undefined ? { collection: patch.collection } : {}),
    ...(patch.gender !== undefined ? { gender: patch.gender } : {}),
    ...(patch.inStock !== undefined ? { inStock: patch.inStock } : {}),
    ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
    copy: { ...product.copy, ...(patch.copy ?? {}) },
    meta: { ...product.meta, updatedAt: new Date().toISOString() },
  };

  if (patch.price) {
    const { selling, mrp } = patch.price;
    next.price = {
      currency: "INR",
      selling,
      mrp: mrp && mrp > selling ? mrp : null,
      discountPct: mrp && mrp > selling ? Math.round(((mrp - selling) / mrp) * 100) : null,
    };
  }

  if (patch.imageOrder) {
    const byUrl = new Map(product.images.map((image) => [image.url, image]));
    next.images = patch.imageOrder
      .map((url) => byUrl.get(url))
      .filter((image): image is NonNullable<typeof image> => Boolean(image));
  }

  if (patch.backdropId !== undefined) next.backdropId = patch.backdropId;

  if (patch.specs) {
    // sourceIndex is dropped deliberately: once a line has been edited by hand it
    // is no longer what the cited page said, and the listing must not imply it is.
    next.specs = patch.specs.map((spec) => ({
      label: spec.label,
      value: spec.value,
      group: spec.group || "Specification",
      sourceIndex: null,
    }));
  }

  if (patch.attributes) next.attributes = { ...product.attributes, ...patch.attributes };

  // Facets are set explicitly rather than re-derived here. The normalisation that
  // turns "10 Bar (Swim)" into the `100` bucket lives in the agent's facets.py and
  // is two hundred lines of hard-won rules; porting it to TypeScript would mean
  // two copies that drift. So when the shop corrects a value by hand it picks
  // from the same controlled vocabulary the filters use, and the admin form sends
  // the readable label for the spec sheet alongside it.
  if (patch.facets) next.facets = { ...product.facets, ...patch.facets };

  // Re-validate before writing so an edit cannot corrupt the artifact.
  const validated = WatchProductSchema.parse(next);
  await fs.writeFile(join(config.dataDir, `${sku}.json`), `${JSON.stringify(validated, null, 2)}\n`);
  await rebuildIndex();
  return validated;
}

/**
 * Appends photographs the shop supplied itself.
 *
 * Goes through the same validate-then-write path as every other edit, so a
 * malformed image record is rejected before it can reach the storefront rather
 * than after.
 */
export async function addImages(sku: string, images: unknown[]): Promise<WatchProduct | null> {
  const product = await getProduct(sku);
  if (!product) return null;

  const next = {
    ...product,
    images: [...product.images, ...images],
    meta: { ...product.meta, updatedAt: new Date().toISOString() },
  };

  const validated = WatchProductSchema.parse(next);
  await fs.writeFile(join(config.dataDir, `${sku}.json`), `${JSON.stringify(validated, null, 2)}\n`);
  await rebuildIndex();
  return validated;
}

/** Removes an artifact and its images. */
export async function deleteProduct(sku: string): Promise<boolean> {
  if (!/^[a-z0-9-]+$/i.test(sku)) return false;
  try {
    await fs.unlink(join(config.dataDir, `${sku}.json`));
  } catch {
    return false;
  }
  await fs.rm(join(config.imageDir, sku), { recursive: true, force: true });
  await rebuildIndex();
  return true;
}

export { COLLECTION_META };
export type { Backdrop };
export type { CollectionId, WatchProduct, CatalogEntry };
