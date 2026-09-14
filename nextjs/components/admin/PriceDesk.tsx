"use client";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { formatInr } from "@/agent/format";
import { VERDICT_LABELS, type PriceFinding, type PriceReport, type Verdict } from "@/lib/pricing.shared";

/**
 * The price watch, reviewed.
 *
 * Proposals first, because they are the only rows that ask anything of the shop.
 * Every one shows the pages it was read from, so "apply" is a decision taken on
 * evidence rather than on the agent's say-so.
 */
export default function PriceDesk({ initial }: { initial: PriceReport | null }) {
  const [report, setReport] = useState(initial);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [filter, setFilter] = useState<"proposals" | Verdict | "all">("proposals");
  const [error, setError] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  const say = useCallback((line: string) => {
    setLog((all) => [...all.slice(-300), line]);
    requestAnimationFrame(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    });
  }, []);

  async function sweep() {
    if (running) return;
    setRunning(true);
    setLog([]);
    setError("");

    try {
      const response = await fetch("/api/admin/reprice", { method: "POST", body: new FormData() });
      if (!response.ok || !response.body) {
        setError("The sweep could not be started.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const payload = chunk.replace(/^data: /, "").trim();
          if (!payload) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(payload);
          } catch {
            continue;
          }

          if (event.type === "price:start") say(`Checking ${event.watches} listed watches…`);
          if (event.type === "price:done") {
            const label = VERDICT_LABELS[event.verdict as Verdict] ?? String(event.verdict);
            const extra = event.suggestedMrp ? ` → propose ${formatInr(Number(event.suggestedMrp))}` : "";
            say(`  ${event.title} — ${label}${extra}`);
          }
          if (event.type === "report") {
            setReport(event.report as PriceReport);
            const r = event.report as PriceReport;
            say(`Done. ${r.proposals} proposal(s) from ${r.checked} watches, $${r.costUsd.toFixed(4)}.`);
          }
          if (event.type === "error") setError(String(event.message));
        }
      }
    } catch {
      setError("Connection lost during the sweep.");
    } finally {
      setRunning(false);
    }
  }

  async function act(sku: string, action: "apply" | "dismiss") {
    setBusy(sku);
    setError("");
    try {
      const response = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku, action }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.errors?.[0] ?? "That did not save.");
        return;
      }
      setReport(payload as PriceReport);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  const findings = report?.findings ?? [];

  const counts = useMemo(() => {
    const map: Record<string, number> = { proposals: 0, all: findings.length };
    for (const f of findings) {
      map[f.verdict] = (map[f.verdict] ?? 0) + 1;
      if (f.suggestedMrp !== null) map.proposals += 1;
    }
    return map;
  }, [findings]);

  const shown = useMemo(() => {
    if (filter === "proposals") return findings.filter((f) => f.suggestedMrp !== null);
    if (filter === "all") return findings;
    return findings.filter((f) => f.verdict === filter);
  }, [findings, filter]);

  return (
    <div>
      <div className="ops-toolbar">
        <button type="button" className="ops-btn" data-variant="solid" onClick={sweep} disabled={running}>
          {running ? "Sweeping…" : "Check prices now"}
        </button>
        {report && (
          <span className="ops-quoted mono">
            Last swept {new Date(report.finishedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
            {" · "}${report.costUsd.toFixed(4)}
          </span>
        )}
      </div>

      {(running || log.length > 0) && (
        <div ref={logRef} className="ops-log">
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {error && <p className="ops-error" role="alert">{error}</p>}

      {findings.length === 0 ? (
        <p className="ops-empty">
          No sweep has been run yet. It reads the brand and trade pages for every listed watch and reports what the
          list price is doing — it changes nothing on its own.
        </p>
      ) : (
        <>
          <div className="ops-filters" style={{ marginBottom: "var(--ops-3)" }}>
            <button type="button" className="ops-filter" data-on={filter === "proposals"} onClick={() => setFilter("proposals")}>
              Needs a decision <span className="mono">{counts.proposals ?? 0}</span>
            </button>
            {(Object.keys(VERDICT_LABELS) as Verdict[]).map((v) => (
              <button key={v} type="button" className="ops-filter" data-on={filter === v} onClick={() => setFilter(v)}>
                {VERDICT_LABELS[v]} <span className="mono">{counts[v] ?? 0}</span>
              </button>
            ))}
            <button type="button" className="ops-filter" data-on={filter === "all"} onClick={() => setFilter("all")}>
              All <span className="mono">{counts.all}</span>
            </button>
          </div>

          {shown.length === 0 ? (
            <p className="ops-empty">Nothing in that group.</p>
          ) : (
            <div className="ops-tickets">
              {shown.map((finding) => (
                <Row key={finding.sku} finding={finding} busy={busy === finding.sku} onAct={act} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({
  finding,
  busy,
  onAct,
}: {
  finding: PriceFinding;
  busy: boolean;
  onAct: (sku: string, action: "apply" | "dismiss") => void;
}) {
  const [open, setOpen] = useState(false);
  const proposes = finding.suggestedMrp !== null;

  return (
    <article className="ops-ticket" data-open={open}>
      <button type="button" className="ops-price-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="ops-ticket-who">
          <b>{finding.title}</b>
          <span className="mono">{finding.modelNumber}</span>
        </span>

        <span className="ops-price-figs mono">
          <span>{formatInr(finding.shopSelling)}</span>
          <span className="ops-price-mrp">
            {finding.shopMrp ? formatInr(finding.shopMrp) : "no MRP"}
            {proposes && <> → <b>{formatInr(finding.suggestedMrp!)}</b></>}
          </span>
        </span>

        <span className={`ops-pill ops-verdict-${finding.verdict}`}>{VERDICT_LABELS[finding.verdict as Verdict] ?? finding.verdict}</span>
      </button>

      {open && (
        <div className="ops-ticket-body">
          <div className="ops-ticket-cols">
            <div>
              <span className="ops-sublabel">What it found</span>
              <p className="ops-issue">{finding.note}</p>

              <span className="ops-sublabel">Figures</span>
              <dl className="ops-dl">
                <dt>Shop charges</dt><dd>{formatInr(finding.shopSelling)}</dd>
                <dt>Stored MRP</dt><dd>{finding.shopMrp ? formatInr(finding.shopMrp) : "—"}</dd>
                <dt>Brand list</dt><dd>{finding.officialMrp ? formatInr(finding.officialMrp) : "—"}</dd>
                <dt>Cheapest seen</dt><dd>{finding.marketLow ? formatInr(finding.marketLow) : "—"}</dd>
                <dt>Median seen</dt><dd>{finding.marketMedian ? formatInr(finding.marketMedian) : "—"}</dd>
              </dl>

              {proposes && (
                <div className="ops-mover-foot" style={{ marginTop: "var(--ops-3)" }}>
                  <button type="button" className="ops-btn" data-variant="solid" disabled={busy}
                    onClick={() => onAct(finding.sku, "apply")}>
                    {busy ? "Saving…" : `Set MRP to ${formatInr(finding.suggestedMrp!)}`}
                  </button>
                  <button type="button" className="ops-btn" disabled={busy} onClick={() => onAct(finding.sku, "dismiss")}>
                    Leave it
                  </button>
                  <Link href={`/admin/review/${finding.sku}`} className="ops-btn">Open the listing</Link>
                </div>
              )}
              <p className="ops-foot-note" style={{ marginTop: "var(--ops-3)" }}>
                Only the list price can be set from here. What the shop charges stays the shop&rsquo;s decision — if
                the market has moved, change it on the listing yourself.
              </p>
            </div>

            <div>
              <span className="ops-sublabel">Read from</span>
              {finding.quotes.length === 0 ? (
                <p className="ops-issue">No page priced this reference.</p>
              ) : (
                <ul className="ops-quotes">
                  {finding.quotes.map((quote, i) => (
                    <li key={`${quote.url}-${i}`}>
                      <a href={quote.url} target="_blank" rel="noreferrer">{quote.publisher}</a>
                      <span className="mono">{formatInr(quote.price)}</span>
                      <span className="ops-quote-kind mono">
                        {quote.kind === "official" ? "official" : "trade"}{quote.isListPrice ? " · list" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
