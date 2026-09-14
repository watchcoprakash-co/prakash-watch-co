/**
 * Offer vocabulary and shape, shared by the stock room and the website.
 *
 * Free of `server-only` and of node imports: the desk that writes offers is a
 * client component and needs the same kinds, labels and type the server stores.
 * `lib/offers.ts` re-exports all of this so server code has one import.
 */
import { z } from "zod";

/** The kinds of arrangement an Indian watch retailer actually runs. */
export const OFFER_KINDS = ["bank", "seasonal", "exchange", "emi", "service", "brand"] as const;
export type OfferKind = (typeof OFFER_KINDS)[number];

export const KIND_LABELS: Record<OfferKind, string> = {
  bank: "Bank & card",
  seasonal: "Festive",
  exchange: "Exchange",
  emi: "EMI",
  service: "Workshop",
  brand: "Brand offer",
};

export const OfferSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** The number that does the selling — "10% up to ₹10,000", "No-cost EMI". */
  headline: z.string().default(""),
  kind: z.enum(OFFER_KINDS),
  blurb: z.string().default(""),
  /** Shown at the counter and in the terms drawer. One line each. */
  terms: z.array(z.string()).default([]),
  /** Optional coupon code. Blank for offers applied at the till. */
  code: z.string().default(""),
  /** Brands it applies to, by display name. Empty means the whole shop. */
  brands: z.array(z.string()).default([]),
  /** ISO dates. Blank `endsAt` means it runs until the shop pulls it. */
  startsAt: z.string().default(""),
  endsAt: z.string().default(""),
  /** Off means it never shows, whatever the dates say. */
  active: z.boolean().default(true),
  /** Lower sorts first. */
  order: z.number().default(100),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Offer = z.infer<typeof OfferSchema>;

export const OfferDraftSchema = z.object({
  title: z.string().trim().min(3, "Give the offer a title.").max(120),
  headline: z.string().trim().max(80).default(""),
  kind: z.enum(OFFER_KINDS),
  blurb: z.string().trim().max(600).default(""),
  terms: z.array(z.string().trim().max(300)).max(12).default([]),
  code: z.string().trim().max(40).default(""),
  brands: z.array(z.string().trim().max(60)).max(20).default([]),
  startsAt: z.string().trim().max(10).default(""),
  endsAt: z.string().trim().max(10).default(""),
  active: z.boolean().default(true),
  order: z.number().min(0).max(9999).default(100),
});

export type OfferDraft = z.infer<typeof OfferDraftSchema>;

/**
 * Whether an offer should be on the website today.
 *
 * Dates are compared as plain `YYYY-MM-DD` strings in the shop's own reckoning:
 * an offer that ends on the 31st is still on all of the 31st, which is what a
 * customer reading "valid till 31 October" reasonably expects.
 */
export function isLive(offer: Offer, today = new Date().toISOString().slice(0, 10)): boolean {
  if (!offer.active) return false;
  if (offer.startsAt && offer.startsAt > today) return false;
  if (offer.endsAt && offer.endsAt < today) return false;
  return true;
}
