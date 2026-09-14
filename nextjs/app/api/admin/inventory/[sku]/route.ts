import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getProduct, updateProduct } from "@/lib/catalog";
import { appendMovements } from "@/lib/ledger";

export const runtime = "nodejs";

const AdjustSchema = z.object({
  /** The counted figure, not a delta — it is what someone sees in the drawer. */
  quantity: z.number().int().min(0).max(9999),
  note: z.string().max(200).default(""),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ sku: string }> }): Promise<Response> {
  const unauthorised = await requireAuth();
  if (unauthorised) return unauthorised;

  const { sku } = await params;
  const product = await getProduct(sku);
  if (!product) return Response.json({ error: "Not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  const parsed = AdjustSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid quantity." }, { status: 400 });
  }

  const before = product.quantity ?? 0;
  const delta = parsed.data.quantity - before;

  // A count that matches changes nothing, and does not deserve a ledger entry.
  if (delta !== 0) {
    await appendMovements([{
      sku,
      kind: "adjustment",
      delta,
      reference: "counted",
      note: parsed.data.note || `Counted ${parsed.data.quantity}, was ${before}`,
    }]);
  }

  const updated = await updateProduct(sku, {
    quantity: parsed.data.quantity,
    inStock: parsed.data.quantity > 0,
  });
  return Response.json({ quantity: updated?.quantity ?? parsed.data.quantity, delta });
}
