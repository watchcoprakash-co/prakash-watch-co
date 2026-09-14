/**
 * The source book's shape.
 *
 * Free of `server-only`: the stock room's reader is a client component and needs
 * the same types the collapsing logic produces.
 */
export interface SourceEntry {
  url: string;
  publisher: string;
  kind: string;
  title: string;
  fetchedAt: string;
  /** How many specifications on the listing were attributed to this page. */
  gaveSpecs: number;
  gaveImages: number;
}

export interface ModelRecord {
  sku: string;
  brand: string;
  modelNumber: string;
  title: string;
  firstSeen: string;
  lastSeen: string;
  runs: number;
  status: string;
  matchConfidence: number;
  sources: SourceEntry[];
  imageSources: string[];
  /** Whether the listing it belongs to still exists in the catalogue. */
  stillListed: boolean;
}

export interface PublisherTally {
  publisher: string;
  models: number;
  specs: number;
  images: number;
  kind: string;
}
