import { requireAuth } from "@/lib/auth";
import { TicketPatchSchema, getTicket, updateTicket } from "@/lib/repairs";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const unauthorised = await requireAuth();
  if (unauthorised) return unauthorised;

  const ticket = await getTicket((await params).id);
  if (!ticket) return Response.json({ errors: ["No such ticket."] }, { status: 404 });
  return Response.json(ticket);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const unauthorised = await requireAuth();
  if (unauthorised) return unauthorised;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ errors: ["Malformed request."] }, { status: 400 });
  }

  const parsed = TicketPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues.map((issue) => issue.message) }, { status: 400 });
  }

  const ticket = await updateTicket((await params).id, parsed.data);
  if (!ticket) return Response.json({ errors: ["No such ticket."] }, { status: 404 });
  return Response.json(ticket);
}
