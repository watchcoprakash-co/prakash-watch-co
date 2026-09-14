/**
 * Service and repair tickets.
 *
 * A watch left at the counter is somebody's property, often an inherited one, so
 * a ticket is written the way a workshop docket is: it records who owns it, what
 * they said was wrong, what it looked like on arrival, and every hand it passed
 * through afterwards. Status changes append to a history rather than overwrite —
 * when a customer asks "you said it would be ready last Tuesday", the answer has
 * to be in the file.
 *
 * One JSON file per ticket, like bills. A shop takes in a few a day.
 */
import "server-only";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { financialYear } from "./firm";
import { SERVICE_KINDS, STATUSES, isClosed, type Status } from "./repairs.shared";

const DIR = join(process.cwd(), "data", "repairs");

// The vocabulary lives in repairs.shared so the public form — a client component,
// which cannot import anything marked server-only — can label the same values.
export { STATUS_LABELS, SERVICE_LABELS } from "./repairs.shared";
export { STATUSES, SERVICE_KINDS, isClosed };
export type { Status, ServiceKind } from "./repairs.shared";

const PhotoSchema = z.object({
  url: z.string(),
  name: z.string(),
  bytes: z.number(),
});

const EventSchema = z.object({
  at: z.string(),
  status: z.enum(STATUSES),
  note: z.string().default(""),
  /** Who moved it. Free text — a small shop has names, not accounts. */
  by: z.string().default(""),
});

export const TicketSchema = z.object({
  id: z.string(),
  ref: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: z.enum(STATUSES),
  customer: z.object({
    name: z.string(),
    phone: z.string(),
    email: z.string().default(""),
    address: z.string().default(""),
  }),
  watch: z.object({
    brand: z.string(),
    model: z.string().default(""),
    reference: z.string().default(""),
    /** Roughly when it was bought — helps judge whether warranty could apply. */
    boughtYear: z.string().default(""),
    boughtHere: z.boolean().default(false),
  }),
  kind: z.enum(SERVICE_KINDS),
  issue: z.string(),
  /** What the customer said the watch arrived with — strap, box, papers. */
  accessories: z.string().default(""),
  photos: z.array(PhotoSchema).default([]),
  /** Quoted amount in rupees once assessed. Null until the workshop has looked. */
  estimate: z.number().nullable().default(null),
  promisedFor: z.string().default(""),
  history: z.array(EventSchema).default([]),
});

export type Ticket = z.infer<typeof TicketSchema>;
export type TicketPhoto = z.infer<typeof PhotoSchema>;

/** What the public form is allowed to send. Everything else is set by the shop. */
export const TicketDraftSchema = z.object({
  name: z.string().trim().min(2, "Please give a name we can put on the docket.").max(120),
  phone: z
    .string()
    .trim()
    .min(7, "A phone number is how the workshop reaches you.")
    .max(20)
    .regex(/^[0-9+][0-9\s+()-]*$/, "That does not look like a phone number."),
  email: z.string().trim().max(160).email("That email address is not valid.").or(z.literal("")).default(""),
  address: z.string().trim().max(400).default(""),
  brand: z.string().trim().min(1, "Which make is the watch?").max(80),
  model: z.string().trim().max(120).default(""),
  reference: z.string().trim().max(80).default(""),
  boughtYear: z
    .string()
    .trim()
    .max(4)
    .regex(/^(19|20)\d{2}$/, "Use a four-digit year.")
    .or(z.literal(""))
    .default(""),
  boughtHere: z.boolean().default(false),
  kind: z.enum(SERVICE_KINDS, { message: "Choose what the watch needs." }),
  issue: z.string().trim().min(10, "Tell us a little more about what it is doing.").max(2000),
  accessories: z.string().trim().max(400).default(""),
});

export type TicketDraft = z.infer<typeof TicketDraftSchema>;

/** What the shop may change afterwards. */
export const TicketPatchSchema = z.object({
  status: z.enum(STATUSES).optional(),
  estimate: z.number().min(0).max(10_000_000).nullable().optional(),
  promisedFor: z.string().max(40).optional(),
  note: z.string().max(1000).optional(),
  by: z.string().max(80).optional(),
});

export type TicketPatch = z.infer<typeof TicketPatchSchema>;

async function readAll(): Promise<Ticket[]> {
  let names: string[];
  try {
    names = await fs.readdir(DIR);
  } catch {
    return [];
  }

  const tickets: Ticket[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const parsed = TicketSchema.safeParse(JSON.parse(await fs.readFile(join(DIR, name), "utf8")));
      if (parsed.success) tickets.push(parsed.data);
    } catch {
      // A single unreadable docket must not hide the rest of the workshop.
    }
  }
  return tickets;
}

/** Newest first — the counter cares about what just came in. */
export async function listTickets(): Promise<Ticket[]> {
  return (await readAll()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getTicket(id: string): Promise<Ticket | null> {
  // Ids are generated here, but this still reads a path built from user input.
  if (!/^svc_[a-z0-9]+$/.test(id)) return null;
  try {
    const parsed = TicketSchema.safeParse(JSON.parse(await fs.readFile(join(DIR, `${id}.json`), "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function write(ticket: Ticket): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(join(DIR, `${ticket.id}.json`), JSON.stringify(ticket, null, 2) + "\n", "utf8");
}

/** `PWC/SVC/2026-27/0007` — the number the customer is given at the counter. */
async function nextRef(): Promise<string> {
  const { label: year } = financialYear(new Date());
  const existing = await readAll();
  const used = existing
    .map((ticket) => ticket.ref)
    .filter((ref) => ref.includes(`/${year}/`))
    .map((ref) => Number(ref.split("/").pop()))
    .filter((n) => Number.isFinite(n));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `PWC/SVC/${year}/${String(next).padStart(4, "0")}`;
}

export async function createTicket(draft: TicketDraft, photos: TicketPhoto[] = []): Promise<Ticket> {
  const now = new Date().toISOString();
  const ticket: Ticket = {
    id: `svc_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`,
    ref: await nextRef(),
    createdAt: now,
    updatedAt: now,
    status: "received",
    customer: { name: draft.name, phone: draft.phone, email: draft.email, address: draft.address },
    watch: {
      brand: draft.brand,
      model: draft.model,
      reference: draft.reference,
      boughtYear: draft.boughtYear,
      boughtHere: draft.boughtHere,
    },
    kind: draft.kind,
    issue: draft.issue,
    accessories: draft.accessories,
    photos,
    estimate: null,
    promisedFor: "",
    history: [{ at: now, status: "received", note: "Request raised on the website.", by: "" }],
  };

  await write(ticket);
  return ticket;
}

/**
 * Applies the shop's changes, appending to the history rather than replacing it.
 *
 * A note without a status change is still an event: "customer called, asked us to
 * hold until Diwali" belongs in the file even though nothing moved.
 */
export async function updateTicket(id: string, patch: TicketPatch): Promise<Ticket | null> {
  const ticket = await getTicket(id);
  if (!ticket) return null;

  const now = new Date().toISOString();
  const status = patch.status ?? ticket.status;
  const note = (patch.note ?? "").trim();

  if (patch.status !== undefined || note) {
    ticket.history.push({ at: now, status, note, by: (patch.by ?? "").trim() });
  }

  ticket.status = status;
  if (patch.estimate !== undefined) ticket.estimate = patch.estimate;
  if (patch.promisedFor !== undefined) ticket.promisedFor = patch.promisedFor.trim();
  ticket.updatedAt = now;

  await write(ticket);
  return ticket;
}

export interface RepairCounts {
  total: number;
  open: number;
  byStatus: Record<Status, number>;
  /** Open tickets whose promised date has passed. */
  overdue: number;
  awaitingApproval: number;
}

export async function getCounts(): Promise<RepairCounts> {
  const tickets = await readAll();
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  const today = new Date().toISOString().slice(0, 10);

  let overdue = 0;
  for (const ticket of tickets) {
    byStatus[ticket.status] += 1;
    if (!isClosed(ticket.status) && ticket.promisedFor && ticket.promisedFor < today) overdue += 1;
  }

  return {
    total: tickets.length,
    open: tickets.filter((ticket) => !isClosed(ticket.status)).length,
    byStatus,
    overdue,
    awaitingApproval: byStatus.quoted,
  };
}
