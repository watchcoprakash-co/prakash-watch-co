/** Starts a price sweep and pipes the agent's progress to the browser. */
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
// 300 is Vercel's own ceiling (Hobby plan rejects anything higher at build
// time); on Render's persistent process this value is inert either way.
export const maxDuration = 300;

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://127.0.0.1:8077";

function sse(payload: unknown): Response {
  return new Response(`data: ${JSON.stringify(payload)}\n\n`, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const unauthorised = await requireAuth();
  if (unauthorised) return unauthorised;

  const form = await request.formData().catch(() => new FormData());
  const outbound = new FormData();
  for (const key of ["only", "limit", "maxPages"]) {
    const value = form.get(key);
    if (typeof value === "string" && value.trim()) {
      outbound.set(key === "maxPages" ? "max_pages" : key, value.trim());
    }
  }

  const token = process.env.AGENT_SERVICE_TOKEN;

  let upstream: Response;
  try {
    upstream = await fetch(`${AGENT_URL}/reprice`, {
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
    return sse({ type: "error", message: `The agent refused the request (${upstream.status}).` });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
