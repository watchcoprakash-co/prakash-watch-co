/**
 * Re-reading every listing's own source page for today's price and discount.
 *
 * Deliberately not the same thing as `/api/admin/reprice`, which searches the
 * open web for what the trade is charging and costs a search plus a model call
 * per watch. This revisits the page the listing was actually built from and asks
 * only what it says now — which costs nothing, because those pages are Shopify
 * products and answer `<url>.json` with the live figures.
 *
 * Streamed rather than awaited: a refresh over two thousand watches takes minutes,
 * and the shop should watch it happen rather than a spinner.
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 900;

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://127.0.0.1:8077";

const BodySchema = z.object({
  /** Omit to refresh the whole catalogue. */
  skus: z.array(z.string().min(1).max(120)).max(3000).optional(),
  /** Report what would change without changing anything. */
  dryRun: z.boolean().optional(),
  /** Include watches still held for review. Off by default: their prices are not
      on the shop, and they are re-researched when approved anyway. */
  includeUnlisted: z.boolean().optional(),
});

function sse(payload: unknown): Response {
  return new Response(`data: ${JSON.stringify(payload)}\n\n`, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const unauthorised = await requireAuth();
  if (unauthorised) return unauthorised;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // An empty body means "the whole catalogue", which is the common case.
  }

  const parsed = BodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }

  const token = process.env.AGENT_SERVICE_TOKEN;
  let upstream: Response;
  try {
    upstream = await fetch(`${AGENT_URL}/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-agent-token": token } : {}) },
      body: JSON.stringify({
        skus: parsed.data.skus,
        dry_run: parsed.data.dryRun ?? false,
        listed_only: !(parsed.data.includeUnlisted ?? false),
      }),
    });
  } catch {
    return sse({
      type: "error",
      message:
        "The research agent is not running. Start it with `uvicorn prakash_agent.server:app --port 8077`.",
    });
  }

  if (!upstream.ok || !upstream.body) {
    let detail = `The agent refused the request (${upstream.status}).`;
    try {
      const error = await upstream.json();
      if (error?.detail) detail = String(error.detail);
    } catch {
      // Non-JSON body; the status is all there is.
    }
    return sse({ type: "error", message: detail });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
