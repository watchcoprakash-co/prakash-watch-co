/**
 * Public repair requests.
 *
 * The only endpoint on this site that accepts writes from a stranger, so it is
 * deliberately narrow: a fixed field list, a small photo allowance, image types
 * checked by magic bytes rather than by the name the browser supplied, and a
 * per-address throttle. Nothing here can reach the catalogue, the books or the
 * till — it writes one docket and nothing else.
 */
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "@/agent/config";
import { TicketDraftSchema, createTicket, type TicketPhoto } from "@/lib/repairs";

export const runtime = "nodejs";

const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const MAX_FIELD_BYTES = 32 * 1024;

/**
 * Signatures rather than declared types: a `.jpg` name and an `image/jpeg` header
 * are both attacker-controlled, the first bytes of the file are not.
 */
const SIGNATURES: { ext: string; test: (b: Buffer) => boolean }[] = [
  { ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  {
    ext: "webp",
    test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
  { ext: "heic", test: (b) => b.subarray(4, 8).toString("ascii") === "ftyp" && /hei|mif1/.test(b.subarray(8, 12).toString("ascii")) },
];

function sniff(bytes: Buffer): string | null {
  return SIGNATURES.find((signature) => signature.test(bytes))?.ext ?? null;
}

/**
 * A crude per-address throttle, held in memory.
 *
 * Enough to stop a bored someone filling the workshop with dockets; it resets on
 * deploy and does not span instances, which is the right trade for a single shop
 * on a single server. If this ever runs behind more than one, move it to a store.
 */
const RATE = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

function throttled(key: string): boolean {
  const now = Date.now();
  const hits = (RATE.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) {
    RATE.set(key, hits);
    return true;
  }
  hits.push(now);
  RATE.set(key, hits);

  // Keep the map from growing without bound on a long-running server.
  if (RATE.size > 5000) {
    for (const [id, times] of RATE) {
      if (times.every((at) => now - at >= WINDOW_MS)) RATE.delete(id);
    }
  }
  return false;
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "local";
  // Hashed: the throttle needs to tell addresses apart, not to record them.
  return createHash("sha256").update(address).digest("hex").slice(0, 32);
}

export async function POST(request: Request): Promise<Response> {
  if (throttled(clientKey(request))) {
    return Response.json(
      { errors: ["That is several requests in a row. Please call the shop on +91 98996 45897 instead."] },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ errors: ["We could not read that form."] }, { status: 400 });
  }

  const text = (key: string): string => {
    const value = form.get(key);
    if (typeof value !== "string") return "";
    return value.length > MAX_FIELD_BYTES ? value.slice(0, MAX_FIELD_BYTES) : value;
  };

  const parsed = TicketDraftSchema.safeParse({
    name: text("name"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    brand: text("brand"),
    model: text("model"),
    reference: text("reference"),
    boughtYear: text("boughtYear"),
    boughtHere: form.get("boughtHere") === "on" || form.get("boughtHere") === "true",
    kind: text("kind"),
    issue: text("issue"),
    accessories: text("accessories"),
  });

  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues.map((issue) => issue.message) }, { status: 400 });
  }

  // Photos are written under a fresh directory per request, so one submission can
  // never overwrite another's, and the id is a UUID rather than anything guessable.
  const folder = randomUUID();
  const root = join(loadConfig().imageDir, "repairs", folder);
  const photos: TicketPhoto[] = [];
  const rejected: string[] = [];

  const files = form.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0);

  for (const file of files.slice(0, MAX_PHOTOS)) {
    if (file.size > MAX_PHOTO_BYTES) {
      rejected.push(`${file.name} is larger than 6 MB.`);
      continue;
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const extension = sniff(bytes);
    if (!extension) {
      rejected.push(`${file.name} is not an image we can read.`);
      continue;
    }

    await fs.mkdir(root, { recursive: true });
    const name = `${String(photos.length + 1).padStart(2, "0")}.${extension}`;
    await fs.writeFile(join(root, name), bytes);
    photos.push({ url: `/media/repairs/${folder}/${name}`, name: file.name.slice(0, 120), bytes: file.size });
  }

  if (files.length === 0 && rejected.length === 0) {
    // Photographs are optional — plenty of faults are audible, not visible.
  }

  const ticket = await createTicket(parsed.data, photos);

  return Response.json(
    {
      ref: ticket.ref,
      // Only what the customer needs back. The docket itself stays in the shop.
      photos: photos.length,
      warnings: rejected,
    },
    { status: 201 },
  );
}
