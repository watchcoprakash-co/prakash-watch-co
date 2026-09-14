/**
 * The catalog data contract.
 *
 * `WatchProduct` is the artifact the agent produces and the storefront consumes.
 * Zod validates it at both ends so a malformed artifact can never reach a page.
 */
import { z } from "zod";
import { COLLECTIONS } from "./config";

/** One row of the client's spreadsheet, after header mapping and coercion. */
export const SheetRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  /** Worksheet the row came from. Stock lists are usually one tab per brand. */
  sheet: z.string(),
  brand: z.string().min(1),
  modelNumber: z.string().min(1),
  price: z.number().positive(),
  mrp: z.number().positive().nullable(),
  modelName: z.string().nullable(),
  gender: z.string().nullable(),
  collectionHint: z.string().nullable(),
  quantity: z.number().int().nonnegative().nullable(),
  productUrl: z.string().nullable(),
  imageUrls: z.array(z.string()),
  notes: z.string().nullable(),
  /**
   * The brand's own site for this tab, usually written in the sheet's header row.
   * Stock lists carry it as a reminder of where the buyer sourced from, and it is
   * the single most useful hint for finding the right product page.
   */
  brandSite: z.string().nullable(),
});
export type SheetRow = z.infer<typeof SheetRowSchema>;

/** A row the parser could not use, kept so the admin panel can show what to fix. */
export interface SheetRowError {
  rowNumber: number;
  sheet: string;
  raw: Record<string, unknown>;
  problems: string[];
}

export interface SheetParseResult {
  rows: SheetRow[];
  errors: SheetRowError[];
  /** Header text as found in the file, mapped to the canonical field it filled. */
  headerMap: Record<string, string>;
  /** Headers present in the file that the agent ignored. */
  unmappedHeaders: string[];
  /** Every worksheet that yielded rows. */
  sheets: string[];
  /** Worksheets that were skipped, with the reason. */
  skippedSheets: Array<{ sheet: string; reason: string }>;
  fileName: string;
}

/** A page the agent read while researching a watch. */
export const SourceSchema = z.object({
  index: z.number().int().nonnegative(),
  url: z.string(),
  title: z.string(),
  publisher: z.string(),
  /** official = brand's own site, retailer = authorised seller, other = anything else. */
  kind: z.enum(["official", "retailer", "marketplace", "editorial", "other"]),
  fetchedAt: z.string(),
});
export type Source = z.infer<typeof SourceSchema>;

/** A single specification line, carrying the source it was read from. */
export const SpecSchema = z.object({
  label: z.string(),
  value: z.string(),
  /** Section heading, e.g. "Movement" or "Case". */
  group: z.string().default("Specification"),
  /** Index into WatchProduct.sources. Null means the agent could not attribute it. */
  sourceIndex: z.number().int().nonnegative().nullable(),
});
export type Spec = z.infer<typeof SpecSchema>;

export const ProductImageSchema = z.object({
  /** Public URL under imageUrlBase, or the remote URL in 'reference' mode. */
  url: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string(),
  kind: z.enum(["product", "wrist", "detail", "lifestyle", "packaging", "other"]),
  /** Low-res inline placeholder for next/image blurDataURL. */
  blurDataURL: z.string().nullable(),
  /** Where the file came from, kept for rights review. */
  sourceUrl: z.string(),
  sourcePage: z.string().nullable(),
  /** 0-1 confidence that this image shows the correct watch. */
  matchScore: z.number().min(0).max(1),
  /** True when the watch was cut out and stored on transparency. */
  hasAlpha: z.boolean().default(false),
  /**
   * Backdrop applied by the agent: "transparent", a preset name, a hex colour, or
   * "original" when the photograph could not be separated from its background.
   */
  background: z.string().default("original"),
});
export type ProductImage = z.infer<typeof ProductImageSchema>;

/** Normalised, filterable view of the specifications. */
export const FacetsSchema = z.object({
  movement: z.string().nullable().default(null),
  caseMaterial: z.string().nullable().default(null),
  strap: z.string().nullable().default(null),
  dialColour: z.string().nullable().default(null),
  waterResistance: z.string().nullable().default(null),
  caseSize: z.string().nullable().default(null),
  functions: z.array(z.string()).default([]),
});
export type Facets = z.infer<typeof FacetsSchema>;

/** Zod 4 wants a complete default object, and artifacts predating facets need one. */
export const EMPTY_FACETS: Facets = {
  movement: null,
  caseMaterial: null,
  strap: null,
  dialColour: null,
  waterResistance: null,
  caseSize: null,
  functions: [],
};

export const CopySchema = z.object({
  tagline: z.string(),
  short: z.string(),
  long: z.string(),
  bullets: z.array(z.string()),
  seoTitle: z.string(),
  seoDescription: z.string(),
});
export type Copy = z.infer<typeof CopySchema>;

export const REVIEW_FLAGS = [
  "no-images",
  "few-images",
  "low-image-match",
  "no-official-source",
  "no-sources",
  "sparse-specs",
  "model-mismatch",
  "price-outlier",
  "unverified-copy",
  "manual-images-only",
  "provisional-image",
  "llm-unavailable",
  "no-price",
  "estimated-price",
] as const;
export type ReviewFlag = (typeof REVIEW_FLAGS)[number];

/** Plain-English meaning of each flag, shown in run reports and the admin panel. */
export const REVIEW_FLAG_EXPLANATIONS: Record<ReviewFlag, string> = {
  "no-images": "No usable photograph was found — the listing cannot go live without one.",
  "few-images": "Only one image. A second angle makes the listing considerably stronger.",
  "low-image-match": "The photographs may show a different colourway or reference.",
  "no-official-source": "Nothing from the brand's own site — specifications came from resellers.",
  "no-sources": "No page could be read at all. Check the reference number.",
  "sparse-specs": "Fewer than four core specifications were confirmed.",
  "model-mismatch": "The pages found appear to describe a different reference.",
  "price-outlier": "The sheet price is far from the price listed online.",
  "unverified-copy": "No specification was confirmed, so the copy is generic.",
  "manual-images-only": "Only the shop's own images were used.",
  "provisional-image":
    "No photograph could be confirmed as this exact reference, so the closest one found is shown. Check it before publishing.",
  "llm-unavailable": "Written without research (dry run or model unavailable).",
  "no-price": "No price yet — the listing shows 'price on request'. Set one when you know it.",
  "estimated-price": "Price taken from what the trade is charging, not the shop's own sheet. Check it before relying on it.",
};

export const WatchProductSchema = z.object({
  /** Stable id derived from brand + model number. Also the artifact filename. */
  sku: z.string(),
  slug: z.string(),
  status: z.enum(["ready", "needs_review", "failed"]),

  brand: z.string(),
  modelNumber: z.string(),
  modelName: z.string().nullable(),
  title: z.string(),

  price: z.object({
    currency: z.literal("INR"),
    /** Null when the sheet was a brand master with no price column. An unpriced
     *  watch is catalogued but never published. */
    selling: z.number().positive().nullable(),
    mrp: z.number().positive().nullable(),
    /** Rounded percentage off MRP, when both are known. */
    discountPct: z.number().nullable(),
  }),

  /**
   * What the shop paid, per unit. Absent unless the stock sheet quoted it or
   * someone entered it — and the books say so plainly rather than valuing stock
   * at retail, which would overstate assets and invent a gross profit.
   */
  costPrice: z.number().positive().nullable().default(null),

  collection: z.enum(COLLECTIONS).nullable(),
  gender: z.enum(["men", "women", "unisex"]).nullable(),
  tags: z.array(z.string()),
  inStock: z.boolean(),
  quantity: z.number().int().nonnegative().nullable(),

  /** Structured attributes. Null means "not stated by any source we read". */
  attributes: z.object({
    movement: z.string().nullable(),
    caliber: z.string().nullable(),
    powerReserve: z.string().nullable(),
    caseMaterial: z.string().nullable(),
    caseDiameterMm: z.number().nullable(),
    caseThicknessMm: z.number().nullable(),
    lugWidthMm: z.number().nullable(),
    crystal: z.string().nullable(),
    dialColour: z.string().nullable(),
    bezel: z.string().nullable(),
    strapMaterial: z.string().nullable(),
    strapColour: z.string().nullable(),
    claspType: z.string().nullable(),
    waterResistance: z.string().nullable(),
    functions: z.array(z.string()),
    warranty: z.string().nullable(),
    launchYear: z.number().int().nullable(),
  }),

  /** Display-ready spec table with per-line attribution. */
  specs: z.array(SpecSchema),
  copy: CopySchema,
  images: z.array(ProductImageSchema),
  /** Backdrop chosen to suit this watch's colour; an id from data/backdrops.json. */
  backdropId: z.string().nullable().default(null),
  facets: FacetsSchema.default(() => ({ ...EMPTY_FACETS })),
  sources: z.array(SourceSchema),

  confidence: z.object({
    overall: z.number().min(0).max(1),
    identity: z.number().min(0).max(1),
    specs: z.number().min(0).max(1),
    images: z.number().min(0).max(1),
  }),

  review: z.object({
    flags: z.array(z.enum(REVIEW_FLAGS)),
    notes: z.array(z.string()),
  }),

  meta: z.object({
    runId: z.string(),
    sheetRow: z.number().int(),
    sourceFile: z.string(),
    model: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    costUsd: z.number(),
    queries: z.array(z.string()),
  }),
});
export type WatchProduct = z.infer<typeof WatchProductSchema>;

/** Compact record the collections grid reads; avoids shipping full artifacts to the client. */
export const CatalogEntrySchema = WatchProductSchema.pick({
  sku: true,
  slug: true,
  status: true,
  brand: true,
  modelNumber: true,
  modelName: true,
  title: true,
  price: true,
  collection: true,
  gender: true,
  inStock: true,
  backdropId: true,
}).extend({
  facets: FacetsSchema.default(() => ({ ...EMPTY_FACETS })),
  tags: z.array(z.string()).default([]),
  image: ProductImageSchema.nullable(),
  tagline: z.string(),
});

/** One generated backdrop from the library the agent writes. */
export const BackdropSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  /** Equivalent CSS wash, so a card is never blank while the image loads. */
  css: z.string(),
  luminance: z.number(),
  hue: z.number().nullable(),
  note: z.string(),
});
export type Backdrop = z.infer<typeof BackdropSchema>;
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;

/** Outcome for one spreadsheet row. */
export interface RowResult {
  rowNumber: number;
  sku: string;
  status: "ready" | "needs_review" | "failed" | "skipped";
  product: WatchProduct | null;
  error: string | null;
  costUsd: number;
  elapsedMs: number;
}

export interface RunReport {
  runId: string;
  startedAt: string;
  finishedAt: string;
  sourceFile: string;
  model: string;
  dryRun: boolean;
  counts: {
    rowsRead: number;
    rowsRejected: number;
    ready: number;
    needsReview: number;
    failed: number;
    skipped: number;
    /** Already listed, and a later sheet moved its price, stock or cost. */
    updated: number;
    imagesSaved: number;
  };
  costUsd: number;
  results: RowResult[];
  sheetErrors: SheetRowError[];
}

/**
 * Has this watch been given a price yet?
 *
 * A brand master can be ingested with no prices at all, so "listed" and "sellable"
 * are no longer the same thing. This narrows the type as well as answering the
 * question, so the compiler enforces the distinction at every call site.
 */
export function isPriced<T extends { price: { selling: number | null } }>(
  entry: T,
): entry is T & { price: { selling: number } } {
  return typeof entry.price.selling === "number";
}
