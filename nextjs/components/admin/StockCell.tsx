"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Editing a stock count in place.
 *
 * The shop counts the drawer and types what it sees, so this takes the counted
 * figure rather than a plus-or-minus — the difference is worked out and written
 * to the ledger, which is where the "why" lives.
 */
export default function StockCell({ sku, quantity }: { sku: string; quantity: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(quantity));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function commit() {
    const next = Number(value);
    if (!Number.isFinite(next) || next < 0 || next === quantity) {
      setValue(String(quantity));
      return;
    }

    setState("saving");
    try {
      const response = await fetch(`/api/admin/inventory/${sku}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quantity: next }),
      });
      if (!response.ok) throw new Error();
      setState("saved");
      router.refresh();
      setTimeout(() => setState("idle"), 1600);
    } catch {
      setState("error");
      setValue(String(quantity));
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <input
        className="ops-field"
        type="number"
        min={0}
        value={value}
        aria-label={`Stock count for ${sku}`}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
        style={{ width: 62, padding: "5px 7px", textAlign: "center" }}
      />
      <span className="mono" aria-live="polite" style={{ fontSize: 9, width: 30,
        color: state === "error" ? "#e0857a" : state === "saved" ? "var(--accent)" : "var(--faint)" }}>
        {state === "saving" ? "…" : state === "saved" ? "ok" : state === "error" ? "!" : ""}
      </span>
    </span>
  );
}
