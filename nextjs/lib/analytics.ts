/**
 * What the shop actually wants to know, computed from what the shop actually has.
 *
 * Three sources meet here: the catalogue the agent writes, the bills the counter
 * writes, and the run reports. Nothing is invented — where there is no data yet
 * (a shop that has not billed anything) the figures are honestly zero rather than
 * seeded, because a dashboard that shows plausible numbers on an empty shop
 * teaches its owner to distrust it.
 */
import "server-only";
import { getAllProducts, type WatchProduct } from "@/lib/catalog";
import { listBills, type Bill } from "@/lib/sales";
import { formatInr } from "@/agent/format";
import { getRuns } from "@/lib/catalog";

export interface Point {
  label: string;
  /** ISO date, for sorting and tooltips. */
  date: string;
  value: number;
}

export interface Overview {
  revenue: { today: number; week: number; month: number; allTime: number };
  /** Same window a year-length ago, so a change can be stated rather than implied. */
  revenuePrevMonth: number;
  billCount: { month: number; allTime: number };
  averageBill: number;
  unitsSold: { month: number; allTime: number };
  stock: {
    units: number;
    skus: number;
    retailValue: number;
    outOfStock: number;
    lowStock: number;
  };
  catalogue: {
    total: number;
    published: number;
    awaitingReview: number;
    withoutPhoto: number;
    provisional: number;
    photoCoverage: number;
    specDepth: number;
  };
  agent: { runs: number; spendUsd: number; lastRunAt: string | null };
  revenueSeries: Point[];
  topSellers: Array<{ sku: string; title: string; units: number; revenue: number }>;
  brandMix: Array<{ brand: string; units: number; value: number; sold: number }>;
  recentBills: Bill[];
}

/** Stock at or below this is worth flagging on the overview. */
export const LOW_STOCK_THRESHOLD = 1;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function sumBills(bills: Bill[]): number {
  return bills.reduce((sum, bill) => sum + (bill.status === "void" ? 0 : bill.total), 0);
}

/** Revenue per day for the last `days` days, including the days with no sales. */
function dailySeries(bills: Bill[], days: number): Point[] {
  const today = startOfDay(new Date());
  const buckets = new Map<string, number>();

  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    buckets.set(day.toISOString().slice(0, 10), 0);
  }

  for (const bill of bills) {
    if (bill.status === "void") continue;
    const key = bill.issuedAt.slice(0, 10);
    // A zero-filled bucket is what makes a quiet week visible instead of absent.
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + bill.total);
  }

  return [...buckets.entries()].map(([date, value]) => ({
    date,
    label: new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    value,
  }));
}

export async function getOverview(): Promise<Overview> {
  const [products, bills, runs] = await Promise.all([getAllProducts(), listBills(), getRuns(50)]);
  const live = bills.filter((bill) => bill.status !== "void");

  const now = new Date();
  const dayStart = startOfDay(now).toISOString();
  const weekStart = new Date(startOfDay(now).getTime() - 6 * 86_400_000).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  const inMonth = live.filter((b) => b.issuedAt >= monthStart);
  const prevMonth = live.filter((b) => b.issuedAt >= prevMonthStart && b.issuedAt < monthStart);

  const unitsIn = (list: Bill[]) =>
    list.reduce((sum, bill) => sum + bill.lines.reduce((n, line) => n + line.quantity, 0), 0);

  // Stock
  const units = products.reduce((sum, p) => sum + (p.quantity ?? 0), 0);
  const retailValue = products.reduce((sum, p) => sum + (p.price.selling ?? 0) * (p.quantity ?? 0), 0);

  // Catalogue health
  const published = products.filter((p) => p.status === "ready");
  const withoutPhoto = products.filter((p) => p.images.length === 0);
  const provisional = products.filter((p) => p.review.flags.includes("provisional-image"));
  const specTotal = products.reduce((sum, p) => sum + p.specs.length, 0);

  // Top sellers
  const seller = new Map<string, { title: string; units: number; revenue: number }>();
  for (const bill of live) {
    for (const line of bill.lines) {
      const entry = seller.get(line.sku) ?? { title: line.title, units: 0, revenue: 0 };
      entry.units += line.quantity;
      entry.revenue += line.unitPrice * line.quantity;
      seller.set(line.sku, entry);
    }
  }

  // Brand mix: what is on the shelf against what has actually moved.
  const brands = new Map<string, { units: number; value: number; sold: number }>();
  for (const product of products) {
    const entry = brands.get(product.brand) ?? { units: 0, value: 0, sold: 0 };
    entry.units += product.quantity ?? 0;
    entry.value += (product.price.selling ?? 0) * (product.quantity ?? 0);
    brands.set(product.brand, entry);
  }
  const bySku = new Map(products.map((p) => [p.sku, p] as const));
  for (const bill of live) {
    for (const line of bill.lines) {
      const brand = bySku.get(line.sku)?.brand ?? "Other";
      const entry = brands.get(brand) ?? { units: 0, value: 0, sold: 0 };
      entry.sold += line.quantity;
      brands.set(brand, entry);
    }
  }

  return {
    revenue: {
      today: sumBills(live.filter((b) => b.issuedAt >= dayStart)),
      week: sumBills(live.filter((b) => b.issuedAt >= weekStart)),
      month: sumBills(inMonth),
      allTime: sumBills(live),
    },
    revenuePrevMonth: sumBills(prevMonth),
    billCount: { month: inMonth.length, allTime: live.length },
    averageBill: live.length ? sumBills(live) / live.length : 0,
    unitsSold: { month: unitsIn(inMonth), allTime: unitsIn(live) },
    stock: {
      units,
      skus: products.length,
      retailValue,
      outOfStock: products.filter((p) => (p.quantity ?? 0) === 0).length,
      lowStock: products.filter((p) => (p.quantity ?? 0) > 0 && (p.quantity ?? 0) <= LOW_STOCK_THRESHOLD).length,
    },
    catalogue: {
      total: products.length,
      published: published.length,
      awaitingReview: products.length - published.length,
      withoutPhoto: withoutPhoto.length,
      provisional: provisional.length,
      photoCoverage: products.length ? (products.length - withoutPhoto.length) / products.length : 0,
      specDepth: products.length ? specTotal / products.length : 0,
    },
    agent: {
      runs: runs.length,
      spendUsd: runs.reduce((sum, run) => sum + run.costUsd, 0),
      lastRunAt: runs[0]?.startedAt ?? null,
    },
    revenueSeries: dailySeries(live, 30),
    topSellers: [...seller.entries()]
      .map(([sku, entry]) => ({ sku, ...entry }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6),
    brandMix: [...brands.entries()]
      .map(([brand, entry]) => ({ brand, ...entry }))
      .sort((a, b) => b.value - a.value),
    recentBills: live.slice(0, 6),
  };
}

/** Stock view: every sku with its count, value and how it is selling. */
export async function getInventory(): Promise<
  Array<{ product: WatchProduct; sold: number; value: number }>
> {
  const [products, bills] = await Promise.all([getAllProducts(), listBills()]);
  const sold = new Map<string, number>();
  for (const bill of bills) {
    if (bill.status === "void") continue;
    for (const line of bill.lines) sold.set(line.sku, (sold.get(line.sku) ?? 0) + line.quantity);
  }

  return products
    .map((product) => ({
      product,
      sold: sold.get(product.sku) ?? 0,
      value: (product.price.selling ?? 0) * (product.quantity ?? 0),
    }))
    .sort((a, b) => (a.product.quantity ?? 0) - (b.product.quantity ?? 0) || b.value - a.value);
}

// ── Detailed analytics ─────────────────────────────────────────────────────────

export interface AnalyticsFilter {
  brands: string[];
  collections: string[];
  /** Days of sales history to report on. */
  days: number;
  /** How the revenue series is bucketed. */
  grain: "day" | "week" | "month";
}

export interface Analytics {
  filter: AnalyticsFilter;
  brandsAvailable: string[];
  collectionsAvailable: string[];
  matched: number;

  kpi: {
    revenue: number;
    unitsSold: number;
    bills: number;
    averageBill: number;
    discountGiven: number;
    gstCollected: number;
    stockUnits: number;
    stockValue: number;
    potentialMargin: number;
    sellThrough: number;
  };

  revenueSeries: Point[];
  unitsSeries: Point[];
  byBrand: Array<{ label: string; value: number; compare: number; hint: string }>;
  byCollection: Array<{ label: string; value: number }>;
  priceBands: Array<{ label: string; value: number }>;
  movement: Array<{ label: string; value: number }>;
  caseSize: Array<{ label: string; value: number }>;
  waterResistance: Array<{ label: string; value: number }>;
  gender: Array<{ label: string; value: number }>;
  paymentMix: Array<{ label: string; value: number }>;
  topSellers: Array<{ label: string; value: number; hint: string }>;
  slowest: Array<{ sku: string; title: string; brand: string; days: number; value: number }>;
}

const PRICE_BANDS: Array<{ label: string; min: number; max: number }> = [
  { label: "under 10k", min: 0, max: 10_000 },
  { label: "10–20k", min: 10_000, max: 20_000 },
  { label: "20–40k", min: 20_000, max: 40_000 },
  { label: "40–75k", min: 40_000, max: 75_000 },
  { label: "75k+", min: 75_000, max: Infinity },
];

const FACET_LABELS: Record<string, Record<string, string>> = {
  movement: { automatic: "Automatic", quartz: "Quartz", solar: "Solar", smart: "Smart / hybrid", "hand-wound": "Hand-wound", mechanical: "Mechanical" },
  caseSize: { "under-36": "Under 36mm", "36-40": "36–40mm", "40-44": "40–44mm", "over-44": "Over 44mm" },
  waterResistance: { "30": "30m", "50": "50m", "100": "100m", "200": "200m+" },
};

const COLLECTION_LABELS: Record<string, string> = {
  "swiss-automatic": "Swiss Automatic",
  "dress-quartz": "Dress Quartz",
  "dive-sport": "Dive & Sport",
  chronograph: "Chronograph",
  "solar-eco": "Solar & Eco",
  connected: "Connected",
};

/** Groups a facet into ordered rows, dropping anything nothing falls into. */
function tally(products: WatchProduct[], pick: (p: WatchProduct) => string | null | undefined, labels?: Record<string, string>, order?: string[]) {
  const counts = new Map<string, number>();
  for (const product of products) {
    const key = pick(product);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows = [...counts.entries()].map(([key, value]) => ({ key, label: labels?.[key] ?? key, value }));
  return order
    ? rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)).map(({ label, value }) => ({ label, value }))
    : rows.sort((a, b) => b.value - a.value).map(({ label, value }) => ({ label, value }));
}

function bucketSeries(bills: Bill[], days: number, grain: AnalyticsFilter["grain"], measure: (bill: Bill) => number): Point[] {
  const today = startOfDay(new Date());
  const buckets = new Map<string, { label: string; value: number }>();

  const keyFor = (date: Date): { key: string; label: string } => {
    if (grain === "month") {
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        label: date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      };
    }
    if (grain === "week") {
      const monday = new Date(date);
      monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      return { key: monday.toISOString().slice(0, 10), label: monday.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) };
    }
    return { key: date.toISOString().slice(0, 10), label: date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) };
  };

  // Empty buckets are created first, so a quiet fortnight is visible as a flat
  // line rather than vanishing from the axis.
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const { key, label } = keyFor(day);
    if (!buckets.has(key)) buckets.set(key, { label, value: 0 });
  }

  for (const bill of bills) {
    const { key } = keyFor(new Date(bill.issuedAt));
    const bucket = buckets.get(key);
    if (bucket) bucket.value += measure(bill);
  }

  return [...buckets.entries()].map(([date, bucket]) => ({ date, label: bucket.label, value: bucket.value }));
}

export async function getAnalytics(filter: AnalyticsFilter): Promise<Analytics> {
  const [allProducts, allBills] = await Promise.all([getAllProducts(), listBills()]);

  const brandsAvailable = [...new Set(allProducts.map((p) => p.brand))].sort();
  const collectionsAvailable = [...new Set(allProducts.map((p) => p.collection).filter(Boolean) as string[])].sort();

  const products = allProducts.filter(
    (product) =>
      (filter.brands.length === 0 || filter.brands.includes(product.brand)) &&
      (filter.collections.length === 0 || (product.collection ? filter.collections.includes(product.collection) : false)),
  );
  const inScope = new Set(products.map((p) => p.sku));

  const since = new Date(startOfDay(new Date()).getTime() - (filter.days - 1) * 86_400_000).toISOString();

  // A bill is kept when any of its lines is in scope, but only those lines count
  // towards the money — otherwise filtering by brand would credit a Seiko sale
  // with the Casio sold on the same invoice.
  const bills = allBills
    .filter((bill) => bill.status !== "void" && bill.issuedAt >= since)
    .map((bill) => ({ ...bill, lines: bill.lines.filter((line) => inScope.has(line.sku)) }))
    .filter((bill) => bill.lines.length > 0);

  const lineValue = (bill: Bill) => bill.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const lineUnits = (bill: Bill) => bill.lines.reduce((sum, line) => sum + line.quantity, 0);

  const revenue = bills.reduce((sum, bill) => sum + lineValue(bill), 0);
  const unitsSold = bills.reduce((sum, bill) => sum + lineUnits(bill), 0);
  const discountGiven = bills.reduce(
    (sum, bill) => sum + bill.lines.reduce((n, line) => n + Math.max(0, line.listPrice - line.unitPrice) * line.quantity, 0),
    0,
  );
  const gstCollected = bills.reduce((sum, bill) => sum + (lineValue(bill) * bill.gstRate) / 100, 0);

  const stockUnits = products.reduce((sum, p) => sum + (p.quantity ?? 0), 0);
  const stockValue = products.reduce((sum, p) => sum + (p.price.selling ?? 0) * (p.quantity ?? 0), 0);
  // Only meaningful where the sheet gave an MRP to compare against.
  const potentialMargin = products.reduce(
    (sum, p) => sum + (p.price.mrp && p.price.selling ? (p.price.mrp - p.price.selling) * (p.quantity ?? 0) : 0),
    0,
  );

  // Sold per sku, for brand sell-through and the best-seller ranking.
  const soldBySku = new Map<string, { units: number; revenue: number; title: string }>();
  for (const bill of bills) {
    for (const line of bill.lines) {
      const entry = soldBySku.get(line.sku) ?? { units: 0, revenue: 0, title: line.title };
      entry.units += line.quantity;
      entry.revenue += line.unitPrice * line.quantity;
      soldBySku.set(line.sku, entry);
    }
  }

  const brandRows = new Map<string, { value: number; compare: number; units: number }>();
  for (const product of products) {
    const row = brandRows.get(product.brand) ?? { value: 0, compare: 0, units: 0 };
    row.value += (product.price.selling ?? 0) * (product.quantity ?? 0);
    row.units += product.quantity ?? 0;
    brandRows.set(product.brand, row);
  }
  for (const [sku, sold] of soldBySku) {
    const brand = products.find((p) => p.sku === sku)?.brand;
    if (!brand) continue;
    const row = brandRows.get(brand) ?? { value: 0, compare: 0, units: 0 };
    row.compare += sold.revenue;
    brandRows.set(brand, row);
  }

  const now = Date.now();
  const slowest = products
    .filter((p) => (p.quantity ?? 0) > 0)
    .map((p) => ({
      sku: p.sku,
      title: p.title,
      brand: p.brand,
      days: Math.max(0, Math.round((now - new Date(p.meta.createdAt).getTime()) / 86_400_000)),
      value: (p.price.selling ?? 0) * (p.quantity ?? 0),
    }))
    .filter((row) => !soldBySku.has(row.sku))
    .sort((a, b) => b.days - a.days || b.value - a.value)
    .slice(0, 8);

  const payments = new Map<string, number>();
  for (const bill of bills) payments.set(bill.payment, (payments.get(bill.payment) ?? 0) + lineValue(bill));

  return {
    filter,
    brandsAvailable,
    collectionsAvailable,
    matched: products.length,
    kpi: {
      revenue,
      unitsSold,
      bills: bills.length,
      averageBill: bills.length ? revenue / bills.length : 0,
      discountGiven,
      gstCollected,
      stockUnits,
      stockValue,
      potentialMargin,
      sellThrough: stockUnits + unitsSold > 0 ? unitsSold / (stockUnits + unitsSold) : 0,
    },
    revenueSeries: bucketSeries(bills, filter.days, filter.grain, lineValue),
    unitsSeries: bucketSeries(bills, filter.days, filter.grain, lineUnits),
    byBrand: [...brandRows.entries()]
      .map(([label, row]) => ({
        label,
        value: row.value,
        compare: row.compare,
        hint: `${row.units} in stock${row.compare ? ` · ${formatInrShort(row.compare)} sold` : ""}`,
      }))
      .sort((a, b) => b.value - a.value),
    byCollection: tally(products, (p) => p.collection, COLLECTION_LABELS),
    priceBands: PRICE_BANDS.map((band) => ({
      label: band.label,
      value: products.filter((p) => p.price.selling !== null && p.price.selling >= band.min && p.price.selling < band.max).length,
    })),
    movement: tally(products, (p) => p.facets.movement, FACET_LABELS.movement),
    caseSize: tally(products, (p) => p.facets.caseSize, FACET_LABELS.caseSize, ["under-36", "36-40", "40-44", "over-44"]),
    waterResistance: tally(products, (p) => p.facets.waterResistance, FACET_LABELS.waterResistance, ["30", "50", "100", "200"]),
    gender: tally(products, (p) => p.gender, { men: "Men", women: "Women", unisex: "Unisex" }),
    paymentMix: [...payments.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    topSellers: [...soldBySku.entries()]
      .map(([, sold]) => ({ label: sold.title, value: sold.revenue, hint: `${sold.units} sold` }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    slowest,
  };
}

function formatInrShort(value: number): string {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${Math.round(value / 1000)}k`;
  return `₹${Math.round(value)}`;
}
