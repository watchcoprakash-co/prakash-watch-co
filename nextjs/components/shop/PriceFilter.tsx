"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/** Min/max price, committed on blur or Enter rather than on every keystroke. */
export default function PriceFilter({
  min,
  max,
  bounds,
}: {
  min: number | null;
  max: number | null;
  bounds: { low: number; high: number };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [from, setFrom] = useState(min === null ? "" : String(min));
  const [to, setTo] = useState(max === null ? "" : String(max));

  useEffect(() => setFrom(min === null ? "" : String(min)), [min]);
  useEffect(() => setTo(max === null ? "" : String(max)), [max]);

  function commit() {
    const next = new URLSearchParams(params.toString());
    const low = Number(from);
    const high = Number(to);

    if (from.trim() && Number.isFinite(low) && low > 0) next.set("min", String(Math.floor(low)));
    else next.delete("min");
    if (to.trim() && Number.isFinite(high) && high > 0) next.set("max", String(Math.ceil(high)));
    else next.delete("max");

    const query = next.toString();
    router.replace(query ? `/collections?${query}` : "/collections", { scroll: false });
  }

  const field: React.CSSProperties = {
    width: "100%",
    padding: "9px 10px",
    background: "var(--panel)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    fontFamily: "inherit",
    fontSize: 13,
    outline: "none",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input
        inputMode="numeric"
        value={from}
        placeholder={`₹${bounds.low.toLocaleString("en-IN")}`}
        aria-label="Minimum price"
        onChange={(event) => setFrom(event.target.value.replace(/[^\d]/g, ""))}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && commit()}
        style={field}
      />
      <span style={{ color: "var(--faint)", fontSize: 12 }}>–</span>
      <input
        inputMode="numeric"
        value={to}
        placeholder={`₹${bounds.high.toLocaleString("en-IN")}`}
        aria-label="Maximum price"
        onChange={(event) => setTo(event.target.value.replace(/[^\d]/g, ""))}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && commit()}
        style={field}
      />
    </div>
  );
}
