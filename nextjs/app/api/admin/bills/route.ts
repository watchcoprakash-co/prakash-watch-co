import { requireAuth } from "@/lib/auth";
import { BillDraftSchema, createBill, listBills } from "@/lib/sales";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const unauthorised = await requireAuth();
  if (unauthorised) return unauthorised;
  return Response.json(await listBills());
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

  const parsed = BillDraftSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues.map((issue) => issue.message) }, { status: 400 });
  }

  // Stock is re-checked inside createBill, so two tills cannot both sell the last one.
  const { bill, errors } = await createBill(parsed.data);
  if (!bill) return Response.json({ errors }, { status: 409 });
  return Response.json(bill, { status: 201 });
}
