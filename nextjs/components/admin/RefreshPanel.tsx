"use client";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Checking today's price at the page each listing came from.
 *
 * The shop's own selling price is never touched — it encodes margin and what the
 * dealer paid. What this corrects is the list price, and therefore the saving the
 * site advertises: when a source revises its list price, a displayed "28% off"
 * quietly stops being true.
 *
 * Costs nothing to run, so "see what would change" is offered first and is worth
 * using: it is the same walk, with the writing turned off.
 */
type Row = {
  sku: string;
  title: string;
  status: string;
  changes: string[];
  price?: number | null;
  listPrice?: number | null;
  discountPct?: number | null;
};

const inr = (n: number | null | undefined) =>
  n == null ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function RefreshPanel({ total }: { total: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [dry, setDry] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [done, setDone] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  const push = useCallback((row: Row) => {
    // Only the watches something moved on are worth showing; the rest are noise.
    if (row.changes.length || row.status === "unreachable") {
      setRows((all) => [...all.slice(-300), row]);
      requestAnimationFrame(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
      });
    }
    setDone((n) => n + 1);
  }, []);

  async function start(dryRun: boolean) {
    if (running) return;
    setRunning(true);
    setDry(dryRun);
    setRows([]);
    setDone(0);
    setSummary(null);
    setError("");

    try {
      const response = await fetch("/api/admin/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({ errors: ["That could not be started."] }));
        setError(payload.errors?.[0] ?? "That could not be started.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done: finished, value } = await reader.read();
        if (finished) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const raw = chunk.replace(/^data: /, "").trim();
          if (!raw) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(raw);
          } catch {
            continue;
          }
          if (event.type === "refresh:row") push(event as unknown as Row);
          if (event.type === "error") setError(String(event.message));
          if (event.type === "report") {
            const r = event.report as Record<string, number | boolean>;
            setSummary(
              `${r.checked} checked · ${r.changed} updated · ${r.unreachable} unreachable${
                r.dryRun ? " · nothing was written" : ""
              }`,
            );
          }
        }
      }
    } catch {
      setError("Connection lost during the refresh.");
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  return (
    <section style={{ border: "1px solid var(--line)", background: "var(--card)", padding: 20 }}>
      <span className="ops-sublabel" style={{ marginTop: 0 }}>Refresh prices from source</span>
      <p style={{ fontSize: 12.5, lineHeight: 1.6, fontWeight: 300, color: "var(--dim)", margin: "0 0 14px", maxWidth: 680 }}>
        Visits the page each of the {total.toLocaleString("en-IN")} <strong>listed</strong> watches was built from
        and reads today&rsquo;s price and list price. Corrects the MRP and the saving shown on the site. Watches
        still held for review are left alone — their prices are not on the shop, and they are researched afresh
        when you approve them. Your own selling prices are never changed, only ones the agent had to look up.
        Costs nothing to run.
      </p>

      <div className="ops-mover-foot">
        <button
          type="button"
          className="ops-btn"
          data-variant="solid"
          disabled={running}
          onClick={() => start(false)}
        >
          {running && !dry ? "Refreshing…" : "Refresh all prices"}
        </button>
        <button type="button" className="ops-btn" disabled={running} onClick={() => start(true)}>
          {running && dry ? "Checking…" : "See what would change"}
        </button>
        {running && (
          <span className="ops-quoted mono">{done} of {total}</span>
        )}
        {summary && <span className="ops-quoted mono">{summary}</span>}
      </div>

      {error && (
        <p className="ops-error" role="alert">{error}</p>
      )}

      {rows.length > 0 && (
        <div ref={logRef} className="ops-log" style={{ marginTop: "var(--ops-3)" }}>
          {rows.map((row, index) => (
            <div key={`${row.sku}-${index}`}>
              {row.status === "unreachable" ? (
                <span style={{ color: "#d8b98a" }}>! {row.sku} — its source page could not be read</span>
              ) : (
                <>
                  <span style={{ color: "var(--accent)" }}>{row.sku}</span>{" "}
                  <span style={{ color: "var(--faint)" }}>
                    now {inr(row.price)} · list {inr(row.listPrice)}
                    {row.discountPct ? ` · ${row.discountPct}% off` : ""}
                  </span>
                  <div style={{ color: "var(--dim)", paddingLeft: 14 }}>{row.changes.join("; ")}</div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
