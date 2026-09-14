/**
 * The price watch's shape and vocabulary.
 *
 * Free of `server-only`, because the stock room's price desk is a client
 * component and needs the same types and labels the reader uses.
 */
import { z } from "zod";

export const VERDICTS = ["mrp-moved", "undercut", "at-list", "keenest", "unchanged", "no-data"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABELS: Record<Verdict, string> = {
  "mrp-moved": "List price moved",
  undercut: "Undercut elsewhere",
  "at-list": "Selling at list",
  keenest: "Cheapest found",
  unchanged: "Agrees",
  "no-data": "Nothing found",
};

const QuoteSchema = z.object({
  price: z.number(),
  url: z.string(),
  publisher: z.string().default(""),
  kind: z.string().default("other"),
  isListPrice: z.boolean().default(false),
});

const FindingSchema = z.object({
  sku: z.string(),
  brand: z.string(),
  modelNumber: z.string(),
  title: z.string(),
  shopSelling: z.number(),
  shopMrp: z.number().nullable().default(null),
  quotes: z.array(QuoteSchema).default([]),
  officialMrp: z.number().nullable().default(null),
  marketLow: z.number().nullable().default(null),
  marketMedian: z.number().nullable().default(null),
  suggestedMrp: z.number().nullable().default(null),
  verdict: z.string().default("no-data"),
  note: z.string().default(""),
  checkedAt: z.string().default(""),
  costUsd: z.number().default(0),
});

export const ReportSchema = z.object({
  runId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  checked: z.number().default(0),
  withData: z.number().default(0),
  proposals: z.number().default(0),
  costUsd: z.number().default(0),
  findings: z.array(FindingSchema).default([]),
});

export type PriceQuote = z.infer<typeof QuoteSchema>;
export type PriceFinding = z.infer<typeof FindingSchema>;
export type PriceReport = z.infer<typeof ReportSchema>;

