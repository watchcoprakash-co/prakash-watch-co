/**
 * Acting on the price watch.
 *
 * Two things only: apply a proposed MRP, or dismiss it. The selling price is not
 * reachable from here at all — correcting a list price and repricing the shelf
 * are different decisions, and only the first is a matter of fact.
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getProduct, updateProduct } from "@/lib/catalog";
import { getPriceWatch, settleFinding } from "@/lib/pricing";

export const runtime = "nodejs";

const ActionSchema = z.object({
  sku: z.string().min(1).max(120),
  action: z.enum(["apply", "dismiss"]),
});

export async function GET(): Promise<Response> {
  const unauthorised = await requireAuth();
  if (unauthorised) return unauthorised;
  return Response.json(await getPriceWatch());
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

  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }

  const { sku, action } = parsed.data;
  const report = await getPriceWatch();
  const finding = report?.findings.find((f) => f.sku === sku);
  if (!finding) return Response.json({ errors: ["No such finding."] }, { status: 404 });

  if (action === "apply") {
    if (finding.suggestedMrp === null) {
      return Response.json({ errors: ["That finding proposes nothing."] }, { status: 400 });
    }

    const product = await getProduct(sku);
    if (!product) return Response.json({ errors: ["That watch is no longer listed."] }, { status: 404 });
    if (product.price.selling === null) {
      return Response.json(
        { errors: ["That watch has no selling price yet, so an MRP would show a meaningless discount."] },
        { status: 400 },
      );
    }

    // An MRP at or below the selling price would show as a nonsense discount, so
    // it is refused here as well as in the agent.
    if (finding.suggestedMrp <= product.price.selling) {
      return Response.json(
        { errors: ["That list price is below what the shop charges, so it cannot be the MRP."] },
        { status: 400 },
      );
    }

    // Only the MRP moves. The selling price is passed back unchanged, deliberately.
    const updated = await updateProduct(sku, {
      price: { selling: product.price.selling, mrp: finding.suggestedMrp },
    });
    if (!updated) return Response.json({ errors: ["Could not save."] }, { status: 500 });
  }

  const next = await settleFinding(sku, action === "apply" ? "applied" : "dismissed");
  return Response.json(next);
}
