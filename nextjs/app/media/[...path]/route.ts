/**
 * Serves catalog imagery from disk at request time.
 *
 * These files are written by the agent while the server is running, and
 * `next start` snapshots the public/ directory at boot — so anything the agent
 * produced after startup would 404 until someone restarted the site. That would
 * make every upload through the admin panel require a restart to see. Reading
 * from disk per request keeps the admin flow working as it should.
 *
 * Filenames carry a content hash, so responses can be cached forever: new artwork
 * always arrives under a new name.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, normalize } from "node:path";
import { Readable } from "node:stream";
import { loadConfig } from "@/agent/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = loadConfig().imageDir;

const CONTENT_TYPES: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  avif: "image/avif",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;

  // Refuse anything that tries to climb out of the media root.
  const relative = normalize(path.join("/"));
  if (relative.startsWith("..") || relative.includes("\0")) {
    return new Response("Not found", { status: 404 });
  }

  const extension = relative.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) return new Response("Not found", { status: 404 });

  const absolute = join(ROOT, relative);
  if (!absolute.startsWith(ROOT)) return new Response("Not found", { status: 404 });

  let size: number;
  try {
    const info = await stat(absolute);
    if (!info.isFile()) return new Response("Not found", { status: 404 });
    size = info.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(absolute)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "content-type": contentType,
      "content-length": String(size),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
