/**
 * What a sheet would cost before any of it is spent.
 *
 * The agent reads the shops' published catalogues — cached for a day, so this is
 * free after the first ask — and reports how many rows can be looked up against
 * how many would have to be searched for, alongside what is left on the account.
 * The last full run stopped two thirds of the way through because the balance
 * reached zero mid-run and nothing on this screen showed it coming.
 *
 * Unlike the ingest route this answers with JSON rather than a stream: it is a
 * question, not a job.
 */
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
// Reading six catalogues cold takes a while; after that they are cached.
// 300 is Vercel's own ceiling (Hobby plan rejects anything higher at build
// time); on Render's persistent process this value is inert either way.
export const maxDuration = 300;

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://127.0.0.1:8077";
const ALLOWED_EXTENSIONS = [".xlsx", ".csv"];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

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
  if (!(file instanceof File)) {
    return Response.json({ error: "No file was attached." }, { status: 400 });
  }

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

  const outbound = new FormData();
  outbound.set("file", file, file.name);
  outbound.set("force", String(form.get("force") === "true"));

  const token = process.env.AGENT_SERVICE_TOKEN;
  let upstream: Response;
  try {
    upstream = await fetch(`${AGENT_URL}/preflight`, {
      method: "POST",
      headers: token ? { "x-agent-token": token } : undefined,
      body: outbound,
    });
  } catch {
    return Response.json(
      {
        error:
          "The research agent is not running. Start it with `uvicorn prakash_agent.server:app --port 8077`.",
      },
      { status: 503 },
    );
  }

  if (!upstream.ok) {
    let detail = `The agent refused the request (${upstream.status}).`;
    try {
      const body = await upstream.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      // Non-JSON body; the status is all there is.
    }
    return Response.json({ error: detail }, { status: 502 });
  }

  return Response.json(await upstream.json());
}
