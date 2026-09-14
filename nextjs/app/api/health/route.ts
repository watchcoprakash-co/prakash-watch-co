/**
 * Liveness check for the host platform (Render). Deliberately says nothing
 * about the agent or the data disk — it only proves this process is up.
 */
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json({ ok: true });
}
