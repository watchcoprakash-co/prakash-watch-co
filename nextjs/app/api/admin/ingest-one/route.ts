/**
 * One watch, researched from a reference typed at the counter.
 *
 * The sibling of `/api/admin/ingest`: same agent, same graph, same streamed
 * events — the only difference is that the row is built here from a form rather
 * than parsed out of a spreadsheet. Price and quantity still come from the shop.
 */
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://127.0.0.1:8077";

function sse(payload: unknown, status = 200): Response {
  return new Response(`data: ${JSON.stringify(payload)}\n\n`, {
    status,
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const unauthorised = await requireAuth();
  if (unauthorised) return unauthorised;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected a form." }, { status: 400 });
  }

  const text = (key: string) => (typeof form.get(key) === "string" ? String(form.get(key)).trim() : "");
  const brand = text("brand");
  const modelNumber = text("modelNumber");
  const priceText = text("price");

  if (!brand || !modelNumber) {
    return Response.json({ error: "A brand and a model number are both needed." }, { status: 400 });
  }
  // Optional: left blank, the agent resolves one from the trade and flags it.
  if (priceText && !(Number(priceText) > 0)) {
    return Response.json({ error: "A price must be a positive figure, or left blank." }, { status: 400 });
  }

  const outbound = new FormData();
  outbound.set("brand", brand);
  outbound.set("model_number", modelNumber);
  if (priceText) outbound.set("price", String(Number(priceText)));

  // Optional commercial fields — sent only when the shop actually filled them,
  // so a blank box means "unknown" rather than zero.
  const optional: [string, string][] = [
    ["mrp", "mrp"],
    ["cost_price", "costPrice"],
    ["quantity", "quantity"],
    ["model_name", "modelName"],
    ["gender", "gender"],
    ["collection_hint", "collectionHint"],
  ];
  for (const [outKey, inKey] of optional) {
    const value = text(inKey);
    if (value) outbound.set(outKey, value);
  }
  if (text("force") === "true") outbound.set("force", "true");

  const token = process.env.AGENT_SERVICE_TOKEN;

  let upstream: Response;
  try {
    upstream = await fetch(`${AGENT_URL}/ingest-one`, {
      method: "POST",
      body: outbound,
      headers: token ? { "x-agent-token": token } : undefined,
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
      const body = await upstream.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      // Non-JSON error body; the status line is all we have.
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
