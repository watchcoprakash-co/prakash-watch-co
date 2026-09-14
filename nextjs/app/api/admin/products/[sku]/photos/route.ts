/**
 * Photographs added by the shop.
 *
 * The agent finds most images, and gets the occasional colourway wrong. When it
 * does, the fastest fix is a photograph taken on the counter — so the shop can
 * add its own, and the listing marks those as its own rather than pretending
 * they came from a source.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join, normalize } from "node:path";
import sharp from "sharp";
import { requireAuth } from "@/lib/auth";
import { loadConfig } from "@/agent/config";
import { addImages, getProduct, updateProduct } from "@/lib/catalog";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_IMAGES = 8;
/** Matches what the agent writes, so shop photographs sit in the same grid. */
const EDGE = 1200;

const SKU = /^[a-z0-9][a-z0-9-]{0,80}$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sku: string }> },
): Promise<Response> {
  const unauthorised = await requireAuth();
  if (unauthorised) return unauthorised;

  const { sku } = await params;
  if (!SKU.test(sku)) return Response.json({ errors: ["Bad sku."] }, { status: 400 });

  const product = await getProduct(sku);
  if (!product) return Response.json({ errors: ["No such watch."] }, { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ errors: ["Expected a file upload."] }, { status: 400 });
  }

  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return Response.json({ errors: ["No image was attached."] }, { status: 400 });

  const room = MAX_IMAGES - product.images.length;
  if (room <= 0) {
    return Response.json({ errors: [`That listing already has ${MAX_IMAGES} photographs.`] }, { status: 400 });
  }

  const dir = join(loadConfig().imageDir, sku);
  await fs.mkdir(dir, { recursive: true });

  const added: typeof product.images = [];
  const errors: string[] = [];

  for (const file of files.slice(0, room)) {
    if (file.size > MAX_BYTES) {
      errors.push(`${file.name} is larger than 12 MB.`);
      continue;
    }

    try {
      const input = Buffer.from(await file.arrayBuffer());
      // sharp both validates the file is really an image and normalises it: a
      // renamed text file throws here rather than reaching the storefront.
      const image = sharp(input, { failOn: "error" });
      const meta = await image.metadata();
      if (!meta.width || !meta.height) throw new Error("unreadable");

      const output = await image
        .rotate() // honour EXIF orientation — phone photographs arrive sideways
        .resize(EDGE, EDGE, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 88 })
        .toBuffer();

      const resized = await sharp(output).metadata();
      // Content-hashed, like the agent's own filenames, so a replaced photograph
      // never serves stale from a browser cache.
      const hash = createHash("sha1").update(output).digest("hex").slice(0, 8);
      const name = `shop-${hash}.webp`;
      await fs.writeFile(join(dir, name), output);

      added.push({
        url: `/media/${sku}/${name}`,
        width: resized.width ?? EDGE,
        height: resized.height ?? EDGE,
        alt: product.title,
        kind: "product",
        blurDataURL: null,
        sourceUrl: "",
        sourcePage: null,
        matchScore: 1,
        hasAlpha: Boolean(resized.hasAlpha),
        // Named so the review screen can say plainly where it came from.
        background: "shop-upload",
      });
    } catch {
      errors.push(`${file.name} is not an image we can read.`);
    }
  }

  if (added.length === 0) {
    return Response.json({ errors: errors.length ? errors : ["Nothing could be added."] }, { status: 400 });
  }

  // Appended through the catalogue so the artifact is re-validated and the
  // storefront index rebuilt exactly as for every other edit.
  const written = await addImages(sku, added);
  if (!written) return Response.json({ errors: ["Could not save the listing."] }, { status: 500 });

  return Response.json({ images: written.images, warnings: errors }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sku: string }> },
): Promise<Response> {
  const unauthorised = await requireAuth();
  if (unauthorised) return unauthorised;

  const { sku } = await params;
  if (!SKU.test(sku)) return Response.json({ errors: ["Bad sku."] }, { status: 400 });

  const url = new URL(request.url).searchParams.get("url") ?? "";
  const product = await getProduct(sku);
  if (!product) return Response.json({ errors: ["No such watch."] }, { status: 404 });
  if (!product.images.some((image) => image.url === url)) {
    return Response.json({ errors: ["That photograph is not on this listing."] }, { status: 404 });
  }

  const remaining = product.images.filter((image) => image.url !== url);
  const updated = await updateProduct(sku, { imageOrder: remaining.map((image) => image.url) });
  if (!updated) return Response.json({ errors: ["Could not save the listing."] }, { status: 500 });

  // Remove the file only once it is off the artifact, and only if it lives in
  // this sku's own folder — a URL pointing anywhere else is not ours to delete.
  const prefix = `/media/${sku}/`;
  if (url.startsWith(prefix)) {
    const name = normalize(url.slice(prefix.length));
    if (!name.startsWith("..") && !name.includes("/")) {
      await fs.rm(join(loadConfig().imageDir, sku, name), { force: true });
    }
  }

  return Response.json({ images: updated.images });
}
