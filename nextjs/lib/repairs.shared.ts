/**
 * Vocabulary shared by the workshop and the public form.
 *
 * Kept free of `server-only` and of any node import, because the customer-facing
 * form is a client component and still has to label the same set of statuses and
 * service kinds the stock room uses. `lib/repairs.ts` re-exports all of this, so
 * server code has one place to import from.
 */

/** Where a ticket is in the workshop. Ordered as the work actually flows. */
export const STATUSES = [
  "received",
  "assessed",
  "quoted",
  "approved",
  "in-progress",
  "ready",
  "collected",
  "declined",
] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  received: "Received",
  assessed: "Assessed",
  quoted: "Quoted",
  approved: "Approved",
  "in-progress": "In the workshop",
  ready: "Ready for collection",
  collected: "Collected",
  declined: "Declined",
};

/** What a customer is asked to say the watch needs. */
export const SERVICE_KINDS = ["battery", "overhaul", "bracelet", "glass", "water", "other"] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

export const SERVICE_LABELS: Record<ServiceKind, string> = {
  battery: "Battery & seal",
  overhaul: "Full overhaul",
  bracelet: "Bracelet, strap or sizing",
  glass: "Glass or crystal",
  water: "Water damage",
  other: "Something else",
};

/** Statuses that mean the watch is no longer the shop's responsibility. */
const CLOSED: ReadonlySet<Status> = new Set<Status>(["collected", "declined"]);

export const isClosed = (status: Status) => CLOSED.has(status);
