import { requireAuth } from "@/lib/auth";
import { OfferDraftSchema, deleteOffer, updateOffer } from "@/lib/offers";

export const runtime = "nodejs";

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

  // Partial: the switch on the offers list sends only `active`.
  const parsed = OfferDraftSchema.partial().safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues.map((issue) => issue.message) }, { status: 400 });
  }

  const offer = await updateOffer((await params).id, parsed.data);
  if (!offer) return Response.json({ errors: ["No such offer."] }, { status: 404 });
  return Response.json(offer);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const unauthorised = await requireAuth();
  if (unauthorised) return unauthorised;

  const removed = await deleteOffer((await params).id);
  if (!removed) return Response.json({ errors: ["No such offer."] }, { status: 404 });
  return Response.json({ ok: true });
}
