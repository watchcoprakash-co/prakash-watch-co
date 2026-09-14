"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Icons } from "./ui";

export interface Sellable {
  sku: string;
  title: string;
  modelNumber: string;
  brand: string;
  price: number;
  quantity: number;
}

interface Line { sku: string; quantity: number; unitPrice: number }

const inr = (n: number) => `₹${new Intl.NumberFormat("en-IN").format(Math.round(n))}`;

/**
 * Writing a bill.
 *
 * Totals update as you type because the number that matters at a counter is the
 * one you are about to say out loud. Stock is capped per line so the till cannot
 * promise a watch the shop does not have, and the price is editable because a
 * boutique negotiates — but the list price stays visible beside it so whatever
 * was given away is on the record rather than lost in a round number.
 */
export default function BillWriter({ stock }: { stock: Sellable[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", address: "" });
  const [gstRate, setGstRate] = useState(18);
  const [payment, setPayment] = useState("cash");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const bySku = useMemo(() => new Map(stock.map((item) => [item.sku, item])), [stock]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const chosen = new Set(lines.map((l) => l.sku));
    return stock
      .filter((item) => item.quantity > 0 && !chosen.has(item.sku))
      .filter((item) => !q || `${item.brand} ${item.title} ${item.modelNumber}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, stock, lines]);

  const totals = useMemo(() => {
    const list = lines.reduce((sum, l) => sum + (bySku.get(l.sku)?.price ?? 0) * l.quantity, 0);
    const taxable = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    const gst = (taxable * gstRate) / 100;
    return { list, taxable, gst, total: taxable + gst, discount: Math.max(0, list - taxable) };
  }, [lines, gstRate, bySku]);

  function add(item: Sellable) {
    setLines((prev) => [...prev, { sku: item.sku, quantity: 1, unitPrice: item.price }]);
    setQuery("");
  }

  function update(sku: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((line) => (line.sku === sku ? { ...line, ...patch } : line)));
  }

  async function submit() {
    setErrors([]);
    if (!customer.name.trim()) return setErrors(["Enter the customer's name."]);
    if (!lines.length) return setErrors(["Add at least one watch."]);

    setBusy(true);
    try {
      const response = await fetch("/api/admin/bills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customer, lines, gstRate, payment, note }),
      });
      const body = await response.json();
      if (!response.ok) {
        setErrors(body.errors ?? ["Could not save the bill."]);
        setBusy(false);
        return;
      }
      router.push(`/admin/billing/${body.id}`);
      router.refresh();
    } catch {
      setErrors(["The server did not respond."]);
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 1fr)", gap: 20, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Items */}
        <section className="ops-panel">
          <h2 className="mono" style={{ margin: "0 0 12px", fontSize: 9.5, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 400 }}>
            Watches
          </h2>

          <label style={{ display: "block", position: "relative" }}>
            <span className="mono" style={{ fontSize: 9, letterSpacing: ".16em", color: "var(--dim)", textTransform: "uppercase" }}>Add by brand, model or reference</span>
            <input className="ops-field" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Seiko, SRPD51K1…" style={{ marginTop: 6 }} />
          </label>

          {matches.length > 0 && (query || lines.length === 0) && (
            <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, border: "1px solid var(--line)", maxHeight: 210, overflowY: "auto" }}>
              {matches.map((item) => (
                <li key={item.sku}>
                  <button type="button" onClick={() => add(item)}
                    style={{ display: "flex", width: "100%", justifyContent: "space-between", gap: 12, alignItems: "center",
                      padding: "9px 12px", background: "transparent", border: "none", borderBottom: "1px solid var(--line2)",
                      color: "var(--body)", font: "inherit", fontSize: 13, cursor: "pointer", textAlign: "left" }}>
                    <span>
                      {item.title}
                      <span className="mono" style={{ display: "block", fontSize: 9.5, color: "var(--faint)", marginTop: 2 }}>
                        {item.modelNumber} · {item.quantity} in stock
                      </span>
                    </span>
                    <span className="mono" style={{ fontSize: 12, color: "var(--text)" }}>{inr(item.price)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {lines.length > 0 && (
            <table className="ops-table" style={{ marginTop: 14 }}>
              <thead>
                <tr><th>Watch</th><th style={{ width: 74 }}>Qty</th><th style={{ width: 116, textAlign: "right" }}>Price each</th><th style={{ textAlign: "right" }}>Amount</th><th /></tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const item = bySku.get(line.sku);
                  if (!item) return null;
                  const cut = item.price - line.unitPrice;
                  return (
                    <tr key={line.sku}>
                      <td>
                        <span style={{ color: "var(--text)" }}>{item.title}</span>
                        <span className="mono" style={{ display: "block", fontSize: 9.5, color: "var(--faint)", marginTop: 2 }}>
                          {item.modelNumber}
                          {cut > 0 && <span style={{ color: "#d8b98a" }}> · {inr(cut)} off list</span>}
                        </span>
                      </td>
                      <td>
                        <input className="ops-field" type="number" min={1} max={item.quantity} value={line.quantity}
                          aria-label={`Quantity for ${item.title}`}
                          onChange={(e) => update(line.sku, { quantity: Math.max(1, Math.min(item.quantity, Number(e.target.value) || 1)) })}
                          style={{ padding: "6px 8px", textAlign: "center" }} />
                      </td>
                      <td>
                        <input className="ops-field" type="number" min={0} value={line.unitPrice}
                          aria-label={`Unit price for ${item.title}`}
                          onChange={(e) => update(line.sku, { unitPrice: Math.max(0, Number(e.target.value) || 0) })}
                          style={{ padding: "6px 8px", textAlign: "right" }} />
                      </td>
                      <td className="ops-num" style={{ color: "var(--text)" }}>{inr(line.unitPrice * line.quantity)}</td>
                      <td>
                        <button type="button" onClick={() => setLines((prev) => prev.filter((l) => l.sku !== line.sku))}
                          aria-label={`Remove ${item.title}`}
                          style={{ background: "transparent", border: "none", color: "var(--faint)", cursor: "pointer", padding: 4, fontSize: 15, lineHeight: 1 }}>
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* Customer */}
        <section className="ops-panel">
          <h2 className="mono" style={{ margin: "0 0 12px", fontSize: 9.5, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 400 }}>
            Customer
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <Field label="Name" required value={customer.name} onChange={(v) => setCustomer({ ...customer, name: v })} />
            <Field label="Phone" value={customer.phone} onChange={(v) => setCustomer({ ...customer, phone: v })} />
            <Field label="Email" value={customer.email} onChange={(v) => setCustomer({ ...customer, email: v })} />
            <Field label="Address" value={customer.address} onChange={(v) => setCustomer({ ...customer, address: v })} />
          </div>
        </section>
      </div>

      {/* Running total */}
      <aside className="ops-panel" style={{ position: "sticky", top: 24 }}>
        <h2 className="mono" style={{ margin: "0 0 14px", fontSize: 9.5, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 400 }}>
          Total
        </h2>

        <Row label="List price" value={inr(totals.list)} />
        {totals.discount > 0 && <Row label="Discount" value={`− ${inr(totals.discount)}`} tone="#d8b98a" />}
        <Row label="Before tax" value={inr(totals.taxable)} />
        <Row label={`GST ${gstRate}%`} value={inr(totals.gst)} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          <span style={{ fontSize: 13 }}>To pay</span>
          <span className="mono" style={{ fontSize: 22, color: "var(--accent-soft)" }}>{inr(totals.total)}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
          <label>
            <span className="mono" style={{ fontSize: 9, letterSpacing: ".14em", color: "var(--dim)", textTransform: "uppercase" }}>GST %</span>
            <input className="ops-field" type="number" min={0} max={50} value={gstRate}
              onChange={(e) => setGstRate(Math.max(0, Math.min(50, Number(e.target.value) || 0)))} style={{ marginTop: 5 }} />
          </label>
          <label>
            <span className="mono" style={{ fontSize: 9, letterSpacing: ".14em", color: "var(--dim)", textTransform: "uppercase" }}>Paid by</span>
            <select className="ops-field" value={payment} onChange={(e) => setPayment(e.target.value)} style={{ marginTop: 5, cursor: "pointer" }}>
              <option value="cash">Cash</option><option value="card">Card</option>
              <option value="upi">UPI</option><option value="bank">Bank</option><option value="other">Other</option>
            </select>
          </label>
        </div>

        <label style={{ display: "block", marginTop: 10 }}>
          <span className="mono" style={{ fontSize: 9, letterSpacing: ".14em", color: "var(--dim)", textTransform: "uppercase" }}>Note</span>
          <input className="ops-field" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Sized, strap adjusted…" style={{ marginTop: 5 }} />
        </label>

        {errors.length > 0 && (
          <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {errors.map((error) => (
              <li key={error} className="mono" style={{ fontSize: 10.5, color: "#e0857a", lineHeight: 1.5 }}>{error}</li>
            ))}
          </ul>
        )}

        <button type="button" className="ops-btn" data-variant="solid" onClick={submit}
          disabled={busy || !lines.length || !customer.name.trim()} style={{ width: "100%", marginTop: 16 }}>
          {busy ? "Saving…" : `Save bill · ${inr(totals.total)}`}
        </button>
        <Link href="/admin/billing" className="ops-btn" style={{ width: "100%", marginTop: 8 }}>Cancel</Link>
      </aside>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 300, color: tone ?? "var(--body)", padding: "5px 0" }}>
      <span>{label}</span>
      <span className="mono" style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <label style={{ display: "block" }}>
      <span className="mono" style={{ fontSize: 9, letterSpacing: ".14em", color: "var(--dim)", textTransform: "uppercase" }}>
        {label}{required && <span style={{ color: "var(--accent)" }}> *</span>}
      </span>
      <input className="ops-field" value={value} onChange={(e) => onChange(e.target.value)} style={{ marginTop: 5 }} />
    </label>
  );
}
