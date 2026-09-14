/**
 * Special offers, managed entirely from the stock room.
 *
 * The shop writes these, not the agent — a bank tie-up or a festive scheme is a
 * commercial arrangement, never something to infer from the catalogue. Each offer
 * carries its own dates and is shown only while it is live, so a Diwali scheme
 * stops appearing on its own rather than because somebody remembered to take it
 * down in January.
 *
 * One file for all of them: a shop runs a handful at a time, and keeping them in
 * a single list makes ordering them trivial.
 */
import "server-only";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { OfferSchema, isLive, type Offer, type OfferDraft } from "./offers.shared";

const FILE = join(process.cwd(), "data", "offers.json");

// Vocabulary and shape live in offers.shared so the stock room's offer desk — a
// client component, which cannot import anything server-only — shares them.
export {
  OFFER_KINDS,
  KIND_LABELS,
  OfferSchema,
  OfferDraftSchema,
  isLive,
} from "./offers.shared";
export type { Offer, OfferKind, OfferDraft } from "./offers.shared";

async function readAll(): Promise<Offer[]> {
  try {
    const parsed = z.array(OfferSchema).safeParse(JSON.parse(await fs.readFile(FILE, "utf8")));
    return parsed.success ? parsed.data : [];
  } catch {
    // No file yet, or a broken one. The shop simply has no offers running.
    return [];
  }
}

async function writeAll(offers: Offer[]): Promise<void> {
  await fs.mkdir(join(process.cwd(), "data"), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(offers, null, 2) + "\n", "utf8");
}

const byOrder = (a: Offer, b: Offer) => a.order - b.order || a.title.localeCompare(b.title);

/** Everything the shop has, live or not. For the stock room. */
export async function listOffers(): Promise<Offer[]> {
  return (await readAll()).sort(byOrder);
}

/** What the public page shows. */
export async function liveOffers(): Promise<Offer[]> {
  const today = new Date().toISOString().slice(0, 10);
  return (await readAll()).filter((offer) => isLive(offer, today)).sort(byOrder);
}

export async function getOffer(id: string): Promise<Offer | null> {
  return (await readAll()).find((offer) => offer.id === id) ?? null;
}

export async function createOffer(draft: OfferDraft): Promise<Offer> {
  const now = new Date().toISOString();
  const offer: Offer = {
    ...draft,
    id: `off_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: now,
    updatedAt: now,
  };
  const offers = await readAll();
  offers.push(offer);
  await writeAll(offers);
  return offer;
}

export async function updateOffer(id: string, draft: Partial<OfferDraft>): Promise<Offer | null> {
  const offers = await readAll();
  const index = offers.findIndex((offer) => offer.id === id);
  if (index === -1) return null;

  offers[index] = { ...offers[index], ...draft, updatedAt: new Date().toISOString() };
  await writeAll(offers);
  return offers[index];
}

export async function deleteOffer(id: string): Promise<boolean> {
  const offers = await readAll();
  const remaining = offers.filter((offer) => offer.id !== id);
  if (remaining.length === offers.length) return false;
  await writeAll(remaining);
  return true;
}
