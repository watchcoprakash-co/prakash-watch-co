import Link from "next/link";
import { notFound } from "next/navigation";
import { getBill } from "@/lib/sales";
import { Icons, formatInr } from "@/components/admin/ui";
import PrintButton from "@/components/admin/PrintButton";

export const dynamic = "force-dynamic";

/**
 * The invoice.
 *
 * Laid out to be printed as much as read: the rail and the buttons drop away
 * under @media print, and the page inverts to ink on paper so it does not cost
 * the shop a cartridge of black toner per customer.
 */
export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bill = await getBill(id);
  if (!bill) notFound();

  const units = bill.lines.reduce((n, line) => n + line.quantity, 0);

  return (
    <>
      <div className="ops-noprint" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <Link href="/admin/billing" className="mono" style={{ fontSize: 9.5, letterSpacing: ".18em", color: "var(--faint)", textTransform: "uppercase" }}>
          ← Billing
        </Link>
        <PrintButton />
      </div>

      {bill.demo && (
        <p className="ops-panel" style={{ maxWidth: 780, margin: "0 0 12px", padding: "10px 16px", fontSize: 12, fontWeight: 300, color: "#d8b98a", borderColor: "#4a3f2c" }}>
          Sample invoice — generated to demonstrate the reports. Not a real sale.
        </p>
      )}

      <article className="ops-panel" style={{ maxWidth: 780, padding: 32 }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 24, flexWrap: "wrap", paddingBottom: 20, borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="serif" style={{ fontSize: 26 }}>Prakash Watch Co.</div>
            <div className="mono" style={{ fontSize: 9.5, letterSpacing: ".2em", color: "var(--muted)", textTransform: "uppercase", marginTop: 4 }}>
              Authorised multi-brand boutique · Delhi NCR
            </div>
            <div style={{ fontSize: 12, fontWeight: 300, color: "var(--dim)", marginTop: 8, lineHeight: 1.7 }}>
              prakashwatchco@gmail.com · +91 98996 45897
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="mono" style={{ fontSize: 9.5, letterSpacing: ".2em", color: "var(--faint)", textTransform: "uppercase" }}>Tax invoice</div>
            <div className="mono" style={{ fontSize: 15, color: "var(--text)", marginTop: 6 }}>{bill.number}</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>
              {new Date(bill.issuedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
            </div>
          </div>
        </header>

        <section style={{ display: "flex", justifyContent: "space-between", gap: 24, flexWrap: "wrap", padding: "18px 0", borderBottom: "1px solid var(--line2)" }}>
          <div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: ".18em", color: "var(--faint)", textTransform: "uppercase" }}>Billed to</div>
            <div style={{ fontSize: 14, color: "var(--text)", marginTop: 6 }}>{bill.customer.name}</div>
            <div style={{ fontSize: 12, fontWeight: 300, color: "var(--dim)", marginTop: 3, lineHeight: 1.7 }}>
              {[bill.customer.phone, bill.customer.email, bill.customer.address].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="mono" style={{ fontSize: 9, letterSpacing: ".18em", color: "var(--faint)", textTransform: "uppercase" }}>Paid by</div>
            <div style={{ fontSize: 14, color: "var(--text)", marginTop: 6, textTransform: "capitalize" }}>{bill.payment}</div>
          </div>
        </section>

        <table className="ops-table" style={{ marginTop: 4 }}>
          <thead>
            <tr>
              <th>Watch</th><th style={{ textAlign: "right" }}>Qty</th>
              <th style={{ textAlign: "right" }}>Rate</th><th style={{ textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {bill.lines.map((line) => (
              <tr key={line.sku}>
                <td>
                  <span style={{ color: "var(--text)" }}>{line.title}</span>
                  <span className="mono" style={{ display: "block", fontSize: 9.5, color: "var(--faint)", marginTop: 2 }}>
                    REF {line.modelNumber.toUpperCase()}
                    {line.listPrice > line.unitPrice && ` · list ${formatInr(line.listPrice)}`}
                  </span>
                </td>
                <td className="ops-num">{line.quantity}</td>
                <td className="ops-num">{formatInr(line.unitPrice)}</td>
                <td className="ops-num" style={{ color: "var(--text)" }}>{formatInr(line.unitPrice * line.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <dl style={{ margin: 0, minWidth: 260 }}>
            <Line label={`Subtotal (${units} watch${units === 1 ? "" : "es"})`} value={formatInr(bill.subtotal)} />
            {bill.discount > 0 && <Line label="Discount" value={`− ${formatInr(bill.discount)}`} />}
            <Line label="Taxable value" value={formatInr(bill.taxable)} />
            <Line label={`GST @ ${bill.gstRate}%`} value={formatInr(bill.gstAmount)} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
              <dt style={{ fontSize: 13 }}>Total paid</dt>
              <dd className="mono" style={{ margin: 0, fontSize: 20, color: "var(--accent-soft)" }}>{formatInr(bill.total)}</dd>
            </div>
          </dl>
        </section>

        {bill.note && (
          <p style={{ marginTop: 20, fontSize: 12, fontWeight: 300, color: "var(--dim)", fontStyle: "italic" }}>{bill.note}</p>
        )}

        <footer className="mono" style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--line2)", fontSize: 9, letterSpacing: ".14em", color: "var(--faint)", textTransform: "uppercase", lineHeight: 1.9 }}>
          Sized, set and warranted in store · Manufacturer warranty applies from the date of this invoice<br />
          Thank you — Prakash Watch Co., since 1976
        </footer>
      </article>
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 300, color: "var(--body)", padding: "4px 0" }}>
      <dt>{label}</dt>
      <dd className="mono" style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>{value}</dd>
    </div>
  );
}
