/**
 * Faceted search over the catalog index.
 *
 * All state lives in the URL, so a filtered view is shareable, survives a reload
 * and needs no client-side store. Filtering runs on the server against the index
 * the agent writes — a few hundred rows, so there is nothing to gain from an
 * external search service, and a good deal of simplicity to lose.
 */
import type { CatalogEntry } from "@/agent/types";
import { COLLECTION_META, type CollectionId } from "@/agent/config";

export type SortKey = "featured" | "price-asc" | "price-desc" | "discount" | "name";

export interface FilterState {
  q: string;
  selected: Record<string, string[]>;
  min: number | null;
  max: number | null;
  inStock: boolean;
  onSale: boolean;
  sort: SortKey;
}

/** One filterable dimension: where its value lives, and how to label it. */
export interface FilterGroup {
  key: string;
  label: string;
  /** Values for one entry — an array so multi-valued groups work the same way. */
  values: (entry: CatalogEntry) => string[];
  /** Display name for a raw value. */
  label_for: (value: string) => string;
  /** Preferred display order; anything else falls to the end, by count. */
  order?: string[];
}

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, " ");

const MOVEMENT_LABELS: Record<string, string> = {
  automatic: "Automatic",
  quartz: "Quartz",
  solar: "Solar",
  smart: "Smart / hybrid",
  "hand-wound": "Hand-wound",
  mechanical: "Mechanical",
};

const CASE_LABELS: Record<string, string> = {
  steel: "Stainless steel",
  resin: "Resin",
  titanium: "Titanium",
  ceramic: "Ceramic",
  "gold-tone": "Gold tone",
  brass: "Brass",
};

const STRAP_LABELS: Record<string, string> = {
  bracelet: "Steel bracelet",
  leather: "Leather",
  resin: "Resin",
  fabric: "Fabric",
};

const WATER_LABELS: Record<string, string> = {
  "30": "30 m — splashes",
  "50": "50 m — showering",
  "100": "100 m — swimming",
  "200": "200 m+ — diving",
};

const SIZE_LABELS: Record<string, string> = {
  "under-36": "Under 36 mm",
  "36-40": "36 – 40 mm",
  "40-44": "40 – 44 mm",
  "over-44": "Over 44 mm",
};

const FUNCTION_LABELS: Record<string, string> = {
  chronograph: "Chronograph",
  date: "Date",
  "day-date": "Day & date",
  gmt: "GMT / world time",
  alarm: "Alarm",
  backlight: "Backlight",
  bluetooth: "Bluetooth",
  "power-reserve": "Power reserve",
};

const GENDER_LABELS: Record<string, string> = { men: "Men", women: "Women", unisex: "Unisex" };

const one = (value: string | null | undefined): string[] => (value ? [value] : []);

export const FILTER_GROUPS: FilterGroup[] = [
  { key: "brand", label: "Brand", values: (e) => one(e.brand), label_for: (v) => v },
  {
    key: "collection",
    label: "Type",
    values: (e) => one(e.collection),
    label_for: (v) => COLLECTION_META[v as CollectionId]?.name ?? titleCase(v),
    order: Object.keys(COLLECTION_META),
  },
  {
    key: "movement",
    label: "Movement",
    values: (e) => one(e.facets.movement),
    label_for: (v) => MOVEMENT_LABELS[v] ?? titleCase(v),
    order: ["automatic", "quartz", "solar", "smart", "hand-wound", "mechanical"],
  },
  { key: "gender", label: "Worn by", values: (e) => one(e.gender), label_for: (v) => GENDER_LABELS[v] ?? titleCase(v) },
  {
    key: "size",
    label: "Case size",
    values: (e) => one(e.facets.caseSize),
    label_for: (v) => SIZE_LABELS[v] ?? v,
    order: ["under-36", "36-40", "40-44", "over-44"],
  },
  {
    key: "water",
    label: "Water resistance",
    values: (e) => one(e.facets.waterResistance),
    label_for: (v) => WATER_LABELS[v] ?? v,
    order: ["30", "50", "100", "200"],
  },
  {
    key: "case",
    label: "Case material",
    values: (e) => one(e.facets.caseMaterial),
    label_for: (v) => CASE_LABELS[v] ?? titleCase(v),
  },
  {
    key: "strap",
    label: "Strap",
    values: (e) => one(e.facets.strap),
    label_for: (v) => STRAP_LABELS[v] ?? titleCase(v),
  },
  {
    key: "colour",
    label: "Dial colour",
    values: (e) => one(e.facets.dialColour),
    label_for: (v) => titleCase(v),
  },
  {
    key: "fn",
    label: "Complications",
    values: (e) => e.facets.functions ?? [],
    label_for: (v) => FUNCTION_LABELS[v] ?? titleCase(v),
    order: Object.keys(FUNCTION_LABELS),
  },
];

const GROUP_BY_KEY = new Map(FILTER_GROUPS.map((group) => [group.key, group]));

type RawParams = Record<string, string | string[] | undefined>;

function readList(params: RawParams, key: string): string[] {
  const raw = params[key];
  const text = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  return text
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readNumber(params: RawParams, key: string): number | null {
  const raw = params[key];
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function parseFilters(params: RawParams): FilterState {
  const selected: Record<string, string[]> = {};
  for (const group of FILTER_GROUPS) {
    const values = readList(params, group.key);
    if (values.length) selected[group.key] = values;
  }

  const sortRaw = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const sort: SortKey = (["featured", "price-asc", "price-desc", "discount", "name"] as const).includes(
    sortRaw as SortKey,
  )
    ? (sortRaw as SortKey)
    : "featured";

  return {
    q: (Array.isArray(params.q) ? params.q[0] : (params.q ?? "")).trim(),
    selected,
    min: readNumber(params, "min"),
    max: readNumber(params, "max"),
    inStock: params.stock === "1",
    onSale: params.sale === "1",
    sort,
  };
}

/** Free-text match across the fields a shopper would actually type. */
function matchesQuery(entry: CatalogEntry, query: string): boolean {
  if (!query) return true;
  const haystack = [
    entry.brand,
    entry.modelName ?? "",
    entry.modelNumber,
    entry.title,
    entry.tagline,
    ...(entry.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();

  // Every word must appear somewhere, so "seiko diver" narrows rather than widens.
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/**
 * Applies the filter state. `skipGroup` leaves one dimension unfiltered, which is
 * how each group's counts are calculated: a facet must show what is available if
 * you changed your mind about that one choice, not what is available already.
 */
export function applyFilters(
  entries: CatalogEntry[],
  state: FilterState,
  skipGroup?: string,
): CatalogEntry[] {
  return entries.filter((entry) => {
    if (!matchesQuery(entry, state.q)) return false;
    if (state.inStock && !entry.inStock) return false;
    if (state.onSale && !entry.price.discountPct) return false;
    // An unpriced watch belongs in no price range at all.
    if (state.min !== null && (entry.price.selling ?? -1) < state.min) return false;
    if (state.max !== null && (entry.price.selling ?? Infinity) > state.max) return false;

    for (const [key, wanted] of Object.entries(state.selected)) {
      if (key === skipGroup || !wanted.length) continue;
      const group = GROUP_BY_KEY.get(key);
      if (!group) continue;
      const values = group.values(entry);
      // Within a group the choices are alternatives; across groups they compound.
      if (!wanted.some((value) => values.includes(value))) return false;
    }
    return true;
  });
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
  selected: boolean;
}

export function facetOptions(
  entries: CatalogEntry[],
  state: FilterState,
  group: FilterGroup,
): FacetOption[] {
  const pool = applyFilters(entries, state, group.key);
  const counts = new Map<string, number>();
  for (const entry of pool) {
    for (const value of group.values(entry)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const selected = state.selected[group.key] ?? [];
  // A selected value stays visible even at zero, so it can always be switched off.
  for (const value of selected) if (!counts.has(value)) counts.set(value, 0);

  return [...counts.entries()]
    .map(([value, count]) => ({
      value,
      label: group.label_for(value),
      count,
      selected: selected.includes(value),
    }))
    .sort((a, b) => {
      if (group.order) {
        const ai = group.order.indexOf(a.value);
        const bi = group.order.indexOf(b.value);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      }
      return b.count - a.count || a.label.localeCompare(b.label);
    });
}

export function sortEntries(entries: CatalogEntry[], sort: SortKey): CatalogEntry[] {
  const sorted = [...entries];
  switch (sort) {
    case "price-asc":
      // Unpriced pieces sort to the end either way rather than reading as free.
      return sorted.sort((a, b) => (a.price.selling ?? Infinity) - (b.price.selling ?? Infinity));
    case "price-desc":
      return sorted.sort((a, b) => (b.price.selling ?? -Infinity) - (a.price.selling ?? -Infinity));
    case "discount":
      return sorted.sort((a, b) => (b.price.discountPct ?? 0) - (a.price.discountPct ?? 0));
    case "name":
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    default:
      // Featured: in stock first, then a photographed listing, then brand order.
      return sorted.sort(
        (a, b) =>
          Number(b.inStock) - Number(a.inStock) ||
          Number(Boolean(b.image)) - Number(Boolean(a.image)) ||
          a.brand.localeCompare(b.brand) ||
          a.title.localeCompare(b.title),
      );
  }
}

/** Serialises state back to a query string, with one value toggled. */
export function toggledHref(state: FilterState, groupKey: string, value: string): string {
  const next: Record<string, string[]> = { ...state.selected };
  const current = next[groupKey] ?? [];
  next[groupKey] = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
  return buildHref({ ...state, selected: next });
}

export function buildHref(state: Partial<FilterState> & { selected?: Record<string, string[]> }): string {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  for (const [key, values] of Object.entries(state.selected ?? {})) {
    if (values.length) params.set(key, values.join(","));
  }
  if (state.min != null) params.set("min", String(state.min));
  if (state.max != null) params.set("max", String(state.max));
  if (state.inStock) params.set("stock", "1");
  if (state.onSale) params.set("sale", "1");
  if (state.sort && state.sort !== "featured") params.set("sort", state.sort);

  const query = params.toString();
  return query ? `/collections?${query}` : "/collections";
}

export function activeCount(state: FilterState): number {
  return (
    Object.values(state.selected).reduce((sum, values) => sum + values.length, 0) +
    (state.inStock ? 1 : 0) +
    (state.onSale ? 1 : 0) +
    (state.min !== null || state.max !== null ? 1 : 0)
  );
}

export { GROUP_BY_KEY };
