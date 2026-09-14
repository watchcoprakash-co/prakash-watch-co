import { getAllProducts } from "@/lib/catalog";
import BillWriter, { type Sellable } from "@/components/admin/BillWriter";
import { Empty, PageHead } from "@/components/admin/ui";

import { isPriced } from "@/agent/types";

export const dynamic = "force-dynamic";

export default async function NewBillPage() {
  const products = await getAllProducts();

  // Anything with stock can be sold, whether or not it is published — the shop
  // sells from the case, and a listing awaiting review is still a real watch.
  // A watch with no price cannot be billed, though: there is nothing to charge.
  const stock: Sellable[] = products
    .filter((product) => (product.quantity ?? 0) > 0)
    .filter(isPriced)
    .map((product) => ({
      sku: product.sku,
      title: product.title,
      modelNumber: product.modelNumber,
      brand: product.brand,
      price: product.price.selling,
      quantity: product.quantity ?? 0,
    }))
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.title.localeCompare(b.title));

  return (
    <>
      <PageHead title="New bill" lead="Add the watches, name the customer, take the payment. Stock and revenue follow automatically." />
      {stock.length === 0 ? (
        <Empty title="Nothing in stock" body="Every reference is showing zero. Run the agent on a stock sheet, or correct the counts in Inventory."
          href="/admin/inventory" cta="Open inventory" />
      ) : (
        <BillWriter stock={stock} />
      )}
    </>
  );
}
