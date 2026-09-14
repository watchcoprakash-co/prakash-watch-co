import { requireAuth } from "@/lib/auth";
import { ProductPatchSchema, deleteProduct, getProduct, updateProduct } from "@/lib/catalog";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ sku: string }> }): Promise<Response> {
  const unauthorised = await requireAuth();
  if (unauthorised) return unauthorised;

  const { sku } = await params;
  const product = await getProduct(sku);
  if (!product) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(product);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ sku: string }> }): Promise<Response> {
  const unauthorised = await requireAuth();
  if (unauthorised) return unauthorised;

  const { sku } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  const parsed = ProductPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "That edit is not valid.", details: parsed.error.issues.map((issue) => issue.message) },
      { status: 400 },
    );
  }

  try {
    const updated = await updateProduct(sku, parsed.data);
    if (!updated) return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json(updated);
  } catch (error) {
    return Response.json({ error: `Could not save: ${(error as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ sku: string }> }): Promise<Response> {
  const unauthorised = await requireAuth();
  if (unauthorised) return unauthorised;

  const { sku } = await params;
  const removed = await deleteProduct(sku);
  if (!removed) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ ok: true });
}
