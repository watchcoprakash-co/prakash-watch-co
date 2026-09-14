/**
 * Sheet upload → the Python agent, streamed back to the browser.
 *
 * The ingestion agent is a LangGraph service (see `agent-py/`). This route only
 * authenticates the request and pipes the agent's server-sent events straight
 * through, so the admin watches the run happen rather than staring at a spinner.
 */
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://127.0.0.1:8077";
const ALLOWED_EXTENSIONS = [".xlsx", ".csv"];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

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
    return Response.json({ error: "Expected a file upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file was attached." }, { status: 400 });

  const name = file.name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return Response.json(
      { error: "Upload an .xlsx or .csv file. Legacy .xls is not supported — re-save it as .xlsx." },
      { status: 400 },
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "That file is larger than 8 MB." }, { status: 400 });
  }

  // Rebuild the form for the agent, translating the field names it expects.
  const outbound = new FormData();
  outbound.set("file", file, file.name);
  outbound.set("dry_run", String(form.get("dryRun") === "true"));
  outbound.set("force", String(form.get("force") === "true"));
  // Do the rows a shop's catalogue can answer before the ones needing a search,
  // so a run cut short by an empty balance has bought the good listings first.
  outbound.set("covered_first", String(form.get("coveredFirst") === "true"));
  // "update" applies the sheet's figures to watches already listed and researches
  // nothing; "add" lists only what is missing and leaves existing prices alone.
  const mode = String(form.get("mode") ?? "both");
  outbound.set("mode", ["update", "add", "both"].includes(mode) ? mode : "both");
  const limit = Number(form.get("limit"));
  if (Number.isFinite(limit) && limit > 0) outbound.set("limit", String(Math.floor(limit)));

  let upstream: Response;
  try {
    upstream = await fetch(`${AGENT_URL}/ingest`, {
      method: "POST",
      body: outbound,
      headers: process.env.AGENT_SERVICE_TOKEN ? { "x-agent-token": process.env.AGENT_SERVICE_TOKEN } : undefined,
    });
  } catch {
    // The most common failure by far is simply that nobody started the agent.
    return sse({
      type: "error",
      message:
        `Could not reach the ingestion agent at ${AGENT_URL}. Start it with:  ` +
        `cd agent-py && ../.venv/bin/uvicorn prakash_agent.server:app --port 8077`,
    });
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return sse({ type: "error", message: `The agent rejected the sheet: ${detail || upstream.status}` });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
