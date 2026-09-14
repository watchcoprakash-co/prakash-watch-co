/**
 * Researching listings again — one, or the whole review queue.
 *
 * The caller sends skus, not watch details: the catalogue already knows the brand,
 * the model number and the shop's commercial figures, and re-deriving them in the
 * browser would be a second place for them to drift. Anything the shop typed —
 * price, MRP, cost, quantity — is passed back in so a re-run cannot quietly
 * replace a real price with a looked-up one.
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getAllProducts, getProduct } from "@/lib/catalog";

export const runtime = "nodejs";
export const maxDuration = 900;

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://127.0.0.1:8077";
const MAX_AT_ONCE = 500;

const BodySchema = z.object({
  /** Explicit list, or omit and use `scope`. */
  skus: z.array(z.string().min(1).max(120)).max(MAX_AT_ONCE).optional(),
  /** "review" re-runs everything currently held for review. */
  scope: z.enum(["review", "flagged"]).optional(),
  /** A reference the shop supplied by hand, for a single watch. */
  reference: z.string().max(80).optional(),
});

function sse(payload: unknown): Response {
  return new Response(`data: ${JSON.stringify(payload)}\n\n`, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const unauthorised = await requireAuth();
  if (unauthorised) return unauthorised;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ errors: ["Malformed request."] }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }

  const { skus, scope, reference } = parsed.data;

  // Resolve to the watches themselves.
  let watches: Awaited<ReturnType<typeof getAllProducts>> = [];
  if (skus?.length) {
    const found = await Promise.all(skus.map((sku) => getProduct(sku)));
    watches = found.filter((p): p is NonNullable<typeof p> => p !== null);
  } else if (scope) {
    const all = await getAllProducts();
    watches =
      scope === "review"
        ? all.filter((p) => p.status === "needs_review")
        : // "flagged" is the narrower set: listed, but carrying something wrong.
          all.filter((p) => p.review.flags.some((f) => f !== "no-price" && f !== "estimated-price"));
  } else {
    return Response.json({ errors: ["Give either skus or a scope."] }, { status: 400 });
  }

  if (watches.length === 0) {
    return sse({ type: "error", message: "Nothing matched — there is nothing to re-run." });
  }
  if (watches.length > MAX_AT_ONCE) {
    return Response.json(
      { errors: [`That is ${watches.length} watches. Re-run at most ${MAX_AT_ONCE} at a time.`] },
      { status: 400 },
    );
  }

  // A hand-typed reference only makes sense for a single watch.
  const overrideRef = watches.length === 1 ? reference?.trim() : undefined;

  const payload = {
    watches: watches.map((product) => ({
      brand: product.brand,
      model_number: product.modelNumber,
      reference: overrideRef || undefined,
      // The shop's own figures survive the re-run. A price it looked up last time
      // is deliberately not sent, so it gets looked up afresh.
      price: product.review.flags.includes("estimated-price") ? undefined : product.price.selling ?? undefined,
      mrp: product.price.mrp ?? undefined,
      cost_price: product.costPrice ?? undefined,
      quantity: product.quantity ?? undefined,
      model_name: product.modelName ?? undefined,
    })),
  };

  const token = process.env.AGENT_SERVICE_TOKEN;
  let upstream: Response;
  try {
    upstream = await fetch(`${AGENT_URL}/rerun`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-agent-token": token } : {}) },
      body: JSON.stringify(payload),
    });
  } catch {
    return sse({
      type: "error",
      message: "The research agent is not running. Start it with `uvicorn prakash_agent.server:app --port 8077`.",
    });
  }

  if (!upstream.ok || !upstream.body) {
    let detail = `The agent refused the request (${upstream.status}).`;
    try {
      const error = await upstream.json();
      if (error?.detail) detail = String(error.detail);
    } catch {
      // Non-JSON body; the status is all we have.
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
