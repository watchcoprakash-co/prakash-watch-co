import { requireAuth } from "@/lib/auth";
import { OfferDraftSchema, createOffer, listOffers } from "@/lib/offers";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const unauthorised = await requireAuth();
  if (unauthorised) return unauthorised;
  return Response.json(await listOffers());
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

  const parsed = OfferDraftSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues.map((issue) => issue.message) }, { status: 400 });
  }

  return Response.json(await createOffer(parsed.data), { status: 201 });
}
