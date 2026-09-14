import Link from "next/link";
import { listBills } from "@/lib/sales";
import { Empty, Icons, PageHead, Stat, formatInr } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const bills = await listBills();
  const live = bills.filter((bill) => bill.status !== "void");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thisMonth = live.filter((bill) => bill.issuedAt >= monthStart);

  const demoCount = live.filter((bill) => bill.demo).length;
  const revenue = live.reduce((sum, bill) => sum + bill.total, 0);
  const tax = live.reduce((sum, bill) => sum + bill.gstAmount, 0);
  const given = live.reduce((sum, bill) => sum + bill.discount, 0);

  return (
    <>
      <PageHead
        title="Billing"
        lead="Every sale written at the counter. A bill takes the watch out of stock and moves the figures on the overview."
        action={<Link href="/admin/billing/new" className="ops-btn" data-variant="solid">{Icons.plus} New bill</Link>}
      />

      {demoCount > 0 && (
        <p className="ops-panel" style={{ margin: "0 0 16px", padding: "12px 16px", fontSize: 12.5, fontWeight: 300, color: "#d8b98a", borderColor: "#4a3f2c" }}>
          {demoCount} of these are sample bills, marked <span className="ops-chip" data-tone="warn" style={{ fontSize: 8 }}>demo</span> below.
          They carry revenue for the charts but never touched stock. Remove them with <code className="mono">npm run demo:purge</code>.
        </p>
      )}

      <section className="ops-cards">
        <Stat label="Billed this month" value={formatInr(thisMonth.reduce((s, b) => s + b.total, 0))} tone="accent"
          sub={`${thisMonth.length} bill${thisMonth.length === 1 ? "" : "s"}`} />
        <Stat label="All time" value={formatInr(revenue)} sub={`${live.length} bills`} />
        <Stat label="GST collected" value={formatInr(tax)} sub="Payable to the department" />
        <Stat label="Discount given" value={formatInr(given)} sub="Off list price, all time" />
      </section>

      <div style={{ marginTop: 20 }}>
        {bills.length === 0 ? (
          <Empty
            title="No bills yet"
            body="Writing a bill records the sale, drops the stock count and feeds the revenue figures. Nothing else in the shop room needs updating by hand."
            href="/admin/billing/new"
            cta="Write the first bill"
          />
        ) : (
          <div className="ops-panel" style={{ padding: 0 }}>
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Number</th><th>Date</th><th>Customer</th><th>Watches</th>
                  <th style={{ textAlign: "right" }}>Before tax</th>
                  <th style={{ textAlign: "right" }}>GST</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th>Paid by</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr key={bill.id}>
                    <td>
                      <Link href={`/admin/billing/${bill.id}`} className="mono" style={{ fontSize: 11, color: "var(--text)" }}>
                        {bill.number}
                      </Link>
                    </td>
                    <td className="mono" style={{ fontSize: 10.5, color: "var(--dim)" }}>
                      {new Date(bill.issuedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                    </td>
                    <td style={{ color: "var(--text)" }}>{bill.customer.name}</td>
                    <td style={{ fontSize: 12, color: "var(--dim)" }}>
                      {bill.lines.map((line) => `${line.title}${line.quantity > 1 ? ` ×${line.quantity}` : ""}`).join(", ")}
                    </td>
                    <td className="ops-num">{formatInr(bill.taxable)}</td>
                    <td className="ops-num" style={{ color: "var(--dim)" }}>{formatInr(bill.gstAmount)}</td>
                    <td className="ops-num" style={{ color: "var(--text)" }}>{formatInr(bill.total)}</td>
                    <td>
                      <span className="ops-chip" data-tone="mute">{bill.payment}</span>
                      {bill.demo && <span className="ops-chip" data-tone="warn" style={{ marginLeft: 6, fontSize: 8 }}>demo</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
