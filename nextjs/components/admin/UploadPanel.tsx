"use client";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import type { AgentEvent } from "@/agent/events";
import type { RunReport } from "@/agent/types";

type StreamMessage = AgentEvent | { type: "report"; report: RunReport } | { type: "error"; message: string };

interface LogLine {
  id: number;
  text: string;
  tone: "plain" | "good" | "warn" | "bad" | "dim";
}

/** What the agent reports about a sheet before any of it is paid for. */
interface SheetPlan {
  rows: number;
  catalogued: number;
  toResearch: number;
  covered: number;
  uncovered: number;
  estimatedCostUsd: number;
  estimatedCostCoveredUsd: number;
  balanceUsd: number | null;
  rejected: number;
  brands: {
    brand: string;
    rows: number;
    catalogued: number;
    covered: number;
    uncovered: number;
    answeredBy: { host: string; rows: number }[];
  }[];
}

/**
 * How many rows a balance actually reaches, spending on the cheap catalogue rows
 * first and the expensive searched-for ones after. Both rates come from the
 * agent's own estimate for this sheet, so they cannot drift from what it charges.
 */
function reachableRows(plan: SheetPlan): number {
  const covered = plan.covered;
  const searched = plan.uncovered;
  const coveredRate = covered > 0 ? plan.estimatedCostCoveredUsd / covered : 0;
  const searchRate =
    searched > 0 ? (plan.estimatedCostUsd - plan.estimatedCostCoveredUsd) / searched : 0;

  let left = plan.balanceUsd ?? 0;
  const affordableCovered = coveredRate > 0 ? Math.min(covered, Math.floor(left / coveredRate)) : 0;
  left -= affordableCovered * coveredRate;
  const affordableSearched = searchRate > 0 ? Math.min(searched, Math.floor(left / searchRate)) : 0;
  return affordableCovered + affordableSearched;
}

/** Renders one pipeline event as a line the shop staff can actually read. */
function describe(event: StreamMessage): { text: string; tone: LogLine["tone"] } | null {
  switch (event.type) {
    case "sheet:parsed":
      return {
        text: `Sheet read — ${event.rows} usable row(s)${event.rejected ? `, ${event.rejected} rejected` : ""}.`,
        tone: event.rejected ? "warn" : "plain",
      };
    case "run:models":
      return { text: `Using ${event.model}.`, tone: "dim" };
    case "sheet:partitioned":
      return {
        text:
          event.mode === "update"
            ? `${event.kept} row(s) match a watch already listed and will be updated. ${event.setAside} row(s) are for watches not listed yet — left alone.`
            : `${event.kept} row(s) are not listed yet and will be researched. ${event.setAside} already-listed row(s) left untouched.`,
        tone: event.setAside ? "warn" : "plain",
      };
    case "run:stage":
      return { text: `${event.stage}…`, tone: "dim" };
    case "sheet:planned":
      return {
        text: `${event.covered} row(s) can be looked up in a shop's catalogue; ${event.uncovered} will need searching for. Doing the first kind first.`,
        tone: "plain",
      };
    case "row:start":
      return { text: `${event.label}`, tone: "plain" };
    case "row:stage":
      return { text: `   ${event.stage} — ${event.detail}`, tone: "dim" };
    case "row:warn":
      return { text: `   ! ${event.message}`, tone: "warn" };
    case "row:done":
      return {
        text: `   ${
          event.status === "ready"
            ? "✓ listed"
            : event.status === "updated"
              ? "✓ updated"
              : event.status === "skipped"
                ? "· skipped"
                : "~ needs review"
        } · ${event.images} image(s)`,
        tone:
          event.status === "ready" || event.status === "updated"
            ? "good"
            : event.status === "skipped"
              ? "dim"
              : "warn",
      };
    case "row:fail":
      return { text: `   ✗ ${event.message}`, tone: "bad" };
    case "budget:exceeded":
      return { text: `Budget reached — remaining rows skipped.`, tone: "bad" };
    case "error":
      return { text: `Could not run: ${event.message}`, tone: "bad" };
    default:
      return null;
  }
}

export default function UploadPanel() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [force, setForce] = useState(false);
  const [limit, setLimit] = useState("");
  // Rows a shop's catalogue can answer come out right almost every time and cost
  // half as much; rows needing a search do neither. Doing the first kind first
  // is what decides which listings exist if the balance runs out mid-run.
  const [coveredFirst, setCoveredFirst] = useState(true);
  const [checking, setChecking] = useState(false);
  const [plan, setPlan] = useState<SheetPlan | null>(null);
  // Two ways in: a monthly sheet, or one reference typed at the counter. Both
  // feed the same graph, so everything below the endpoint is shared.
  /**
   * Three jobs, because they carry different risks.
   *
   * "add" researches what the sheet lists and the catalogue lacks. "update"
   * applies a sheet's prices, discounts and stock counts to watches already
   * listed and researches nothing — a revised price list is not an instruction
   * to buy two hundred new listings, which is what sending one used to do.
   */
  const [mode, setMode] = useState<"add" | "update" | "one">("add");
  const isSheet = mode === "add" || mode === "update";
  const [one, setOne] = useState({
    brand: "", modelNumber: "", price: "", mrp: "", costPrice: "", quantity: "", modelName: "",
  });
  const [lines, setLines] = useState<LogLine[]>([]);
  const [report, setReport] = useState<RunReport | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const logRef = useRef<HTMLDivElement>(null);
  const lineId = useRef(0);

  const append = useCallback((text: string, tone: LogLine["tone"]) => {
    lineId.current += 1;
    setLines((previous) => [...previous.slice(-400), { id: lineId.current, text, tone }]);
    requestAnimationFrame(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    });
  }, []);

  /** What the sheet would cost, before committing to it. Spends nothing. */
  async function check() {
    if (!file || checking || running) return;
    setChecking(true);
    setPlan(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("force", String(force));
      const response = await fetch("/api/admin/preflight", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) {
        append(body?.error ?? "That could not be checked.", "bad");
        return;
      }
      setPlan(body as SheetPlan);
    } catch (error) {
      append(`Could not check the sheet: ${(error as Error).message}`, "bad");
    } finally {
      setChecking(false);
    }
  }

  function start() {
    if (running) return;
    if (isSheet) {
      if (!file) return;
      const form = new FormData();
      form.set("file", file);
      form.set("mode", mode);
      form.set("dryRun", String(dryRun));
      // Updating from a sheet never re-researches, so "redo" cannot apply to it.
      form.set("force", String(mode === "add" && force));
      form.set("coveredFirst", String(mode === "add" && coveredFirst));
      if (limit.trim()) form.set("limit", limit.trim());
      return runStream("/api/admin/ingest", form);
    }

    if (!one.brand.trim() || !one.modelNumber.trim() || !one.price.trim()) return;
    const form = new FormData();
    form.set("brand", one.brand.trim());
    form.set("modelNumber", one.modelNumber.trim());
    form.set("price", one.price.trim());
    for (const key of ["mrp", "costPrice", "quantity", "modelName"] as const) {
      if (one[key].trim()) form.set(key, one[key].trim());
    }
    form.set("force", String(force));
    return runStream("/api/admin/ingest-one", form);
  }

  async function runStream(url: string, form: FormData) {
    setRunning(true);
    setLines([]);
    setReport(null);
    setProgress({ done: 0, total: 0 });

    try {
      const response = await fetch(url, { method: "POST", body: form });

      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({ error: "The upload was rejected." }));
        append((body as { error?: string }).error ?? "The upload was rejected.", "bad");
        setRunning(false);
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

          let event: StreamMessage;
          try {
            event = JSON.parse(payload) as StreamMessage;
          } catch {
            continue;
          }

          if (event.type === "run:start") setProgress({ done: 0, total: event.rows });
          if (event.type === "row:done" || event.type === "row:fail") {
            setProgress((previous) => ({ ...previous, done: previous.done + 1 }));
          }
          if (event.type === "report") {
            setReport(event.report);
            continue;
          }

          const line = describe(event);
          if (line) append(line.text, line.tone);
        }
      }
    } catch (error) {
      append(`Connection lost: ${(error as Error).message}`, "bad");
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  const toneColour: Record<LogLine["tone"], string> = {
    plain: "var(--body)",
    good: "var(--accent)",
    warn: "#d8b98a",
    bad: "#e0857a",
    dim: "var(--faint)",
  };

  return (
    <section style={{ border: "1px solid var(--line)", background: "var(--card)" }}>
      <div style={{ padding: "26px 26px 0" }}>
        <h2 className="serif" style={{ fontSize: 28, margin: 0, fontWeight: 400 }}>
          {mode === "update" ? "Update stock" : "Add stock"}
        </h2>

        <div className="ops-filters" style={{ margin: "16px 0 14px" }}>
          <button type="button" className="ops-filter" data-on={mode === "add"} disabled={running}
            onClick={() => setMode("add")}>Add new stock</button>
          <button type="button" className="ops-filter" data-on={mode === "update"} disabled={running}
            onClick={() => setMode("update")}>Update prices &amp; stock</button>
          <button type="button" className="ops-filter" data-on={mode === "one"} disabled={running}
            onClick={() => setMode("one")}>One watch</button>
        </div>

        <p style={{ margin: "0 0 22px", fontSize: 14, lineHeight: 1.65, fontWeight: 300, color: "var(--muted)", maxWidth: 620 }}>
          {mode === "add"
            ? "Upload the inventory list as .xlsx or .csv. It needs a brand column, a model number column and a price column — the names can be whatever the shop already uses. Anything already listed is left untouched; everything new is researched and written for you, then held for review."
            : mode === "update"
              ? "For a revised price list, a discount sheet or a fresh stock count. Rows matching a watch already listed have their price, discount, cost and quantity updated — nothing is researched, nothing is bought, and any row for a watch the shop has not listed yet is set aside rather than added."
              : "For a single piece that arrived outside the monthly sheet. Give the make, the reference and what the shop charges; the rest is researched and written the same way, and held for review."}
        </p>
      </div>

      {mode === "one" && (
        <div className="ops-one" style={{ padding: "0 26px 4px" }}>
          <div className="ops-mover-row">
            <label style={{ flex: 2 }}>
              <span>Make *</span>
              <input value={one.brand} disabled={running} placeholder="Seiko"
                onChange={(e) => setOne((o) => ({ ...o, brand: e.target.value }))} />
            </label>
            <label style={{ flex: 2 }}>
              <span>Model number *</span>
              <input value={one.modelNumber} disabled={running} placeholder="SRPD37J1"
                onChange={(e) => setOne((o) => ({ ...o, modelNumber: e.target.value }))} />
            </label>
            <label style={{ flex: 2 }}>
              <span>Model name</span>
              <input value={one.modelName} disabled={running} placeholder="if you know it"
                onChange={(e) => setOne((o) => ({ ...o, modelName: e.target.value }))} />
            </label>
          </div>
          <div className="ops-mover-row">
            <label>
              <span>Selling ₹ *</span>
              <input inputMode="numeric" value={one.price} disabled={running}
                onChange={(e) => setOne((o) => ({ ...o, price: e.target.value.replace(/[^\d.]/g, "") }))} />
            </label>
            <label>
              <span>MRP ₹</span>
              <input inputMode="numeric" value={one.mrp} disabled={running}
                onChange={(e) => setOne((o) => ({ ...o, mrp: e.target.value.replace(/[^\d.]/g, "") }))} />
            </label>
            <label>
              <span>Cost ₹</span>
              <input inputMode="numeric" value={one.costPrice} disabled={running}
                onChange={(e) => setOne((o) => ({ ...o, costPrice: e.target.value.replace(/[^\d.]/g, "") }))} />
            </label>
            <label>
              <span>Quantity</span>
              <input inputMode="numeric" value={one.quantity} disabled={running}
                onChange={(e) => setOne((o) => ({ ...o, quantity: e.target.value.replace(/\D/g, "") }))} />
            </label>
          </div>
          <p className="ops-foot-note" style={{ marginTop: 6 }}>
            Price, MRP and quantity are the shop&rsquo;s to set — nothing found online will change them. Only the
            photographs, the specification and the copy are researched.
          </p>
        </div>
      )}

      {/* Drop zone — sheet mode only */}
      {isSheet && (
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = event.dataTransfer.files?.[0];
          if (dropped) setFile(dropped);
        }}
        style={{
          display: "block",
          margin: "0 26px",
          padding: "34px 24px",
          textAlign: "center",
          cursor: running ? "not-allowed" : "pointer",
          border: `1px dashed ${dragging ? "var(--accent)" : "var(--border)"}`,
          background: dragging ? "rgba(255,255,255,0.02)" : "transparent",
          transition: "border-color .3s, background-color .3s",
        }}
      >
        <input
          type="file"
          accept=".xlsx,.csv"
          disabled={running}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          style={{ display: "none" }}
        />
        <span className="mono" style={{ fontSize: 11, letterSpacing: "0.16em", color: file ? "var(--text)" : "var(--dim)", textTransform: "uppercase" }}>
          {file ? file.name : "Drop the sheet here, or click to choose"}
        </span>
      </label>
      )}

      {/* Options */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 22, alignItems: "center", padding: "20px 26px" }}>
        {isSheet && mode !== "update" && (
          <Toggle label="Dry run (no research, no spend)" checked={dryRun} onChange={setDryRun} disabled={running} />
        )}
        {mode !== "update" && (
          <Toggle label="Redo rows already listed" checked={force} onChange={setForce} disabled={running} />
        )}
        {mode === "add" && (
          <Toggle
            label="Look-up-able rows first"
            checked={coveredFirst}
            onChange={setCoveredFirst}
            disabled={running}
          />
        )}

        {isSheet && (
        <label className="mono" style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 9.5, letterSpacing: "0.14em", color: "var(--dim)", textTransform: "uppercase" }}>
          First
          <input
            type="number"
            min={1}
            value={limit}
            placeholder="all"
            disabled={running}
            onChange={(event) => setLimit(event.target.value)}
            style={{
              width: 66,
              padding: "7px 9px",
              background: "var(--panel)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              fontFamily: "inherit",
              fontSize: 11,
            }}
          />
          rows
        </label>
        )}

        {mode === "add" && (
          <button
            type="button"
            onClick={check}
            disabled={!file || checking || running}
            data-hover
            className="btn"
            style={{
              marginLeft: "auto",
              cursor: !file || checking || running ? "not-allowed" : "pointer",
              opacity: !file || running ? 0.45 : 1,
            }}
          >
            {checking ? "Checking…" : "Check before spending"}
          </button>
        )}

        <button
          type="button"
          onClick={start}
          disabled={running || (isSheet ? !file : !one.brand.trim() || !one.modelNumber.trim() || !one.price.trim())}
          data-hover
          className="btn btn-solid"
          style={{
            // The check button takes the gap when it is shown.
            marginLeft: mode === "add" ? undefined : "auto",
            border: "none",
            cursor: running ? "not-allowed" : "pointer",
            opacity: (isSheet && !file) || running ? 0.45 : 1,
          }}
        >
          {running
            ? "Working…"
            : mode === "update"
              ? "Apply the sheet"
              : dryRun && isSheet
                ? "Dry run"
                : "Research and list"}
        </button>
      </div>

      {plan && !running && (
        <div style={{ padding: "0 26px 24px" }}>
          <div style={{ border: "1px solid var(--line)", background: "var(--panel)", padding: "18px 20px" }}>
            <p style={{ margin: "0 0 4px", fontSize: 15, lineHeight: 1.6, color: "var(--text)" }}>
              {plan.toResearch === 0 ? (
                <>Every one of the {plan.rows} rows is already listed. Nothing to research.</>
              ) : (
                <>
                  <strong>{plan.covered}</strong> of the {plan.toResearch} unlisted rows can be looked up in a
                  shop&rsquo;s published catalogue — those come out right almost every time.{" "}
                  <strong>{plan.uncovered}</strong> would have to be searched for, which costs twice as much and
                  is far likelier to need correcting.
                </>
              )}
            </p>
            <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "var(--muted)" }}>
              {plan.catalogued > 0 && <>{plan.catalogued} row(s) already listed and will be skipped. </>}
              {plan.rejected > 0 && <>{plan.rejected} row(s) unreadable. </>}
              {plan.toResearch > 0 && (
                <>
                  Estimated cost <strong style={{ color: "var(--text)" }}>${plan.estimatedCostUsd.toFixed(2)}</strong>
                  {plan.uncovered > 0 && <> (${plan.estimatedCostCoveredUsd.toFixed(2)} for the look-up-able rows alone)</>}.
                </>
              )}
            </p>
            {plan.balanceUsd !== null && plan.toResearch > 0 && (
              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  color: plan.balanceUsd < plan.estimatedCostUsd ? "#e0857a" : "var(--muted)",
                }}
              >
                Balance ${plan.balanceUsd.toFixed(2)}.{" "}
                {plan.balanceUsd < plan.estimatedCostUsd ? (
                  <>
                    That is not enough for the whole sheet. With look-up-able rows first, it will get through
                    roughly {reachableRows(plan)} of the {plan.toResearch} before stopping — and the listings it
                    does buy will be the good ones.
                  </>
                ) : (
                  <>Enough for the whole sheet.</>
                )}
              </p>
            )}

            {plan.brands.length > 0 && plan.toResearch > 0 && (
              <div style={{ overflowX: "auto", marginTop: 16 }}>
                <table className="mono" style={{ borderCollapse: "collapse", fontSize: 11.5, width: "100%" }}>
                  <thead>
                    <tr style={{ color: "var(--dim)", textAlign: "left" }}>
                      <th style={{ padding: "6px 12px 6px 0", fontWeight: 400 }}>BRAND</th>
                      <th style={{ padding: "6px 12px", fontWeight: 400 }}>TO DO</th>
                      <th style={{ padding: "6px 12px", fontWeight: 400 }}>LOOK-UP-ABLE</th>
                      <th style={{ padding: "6px 12px", fontWeight: 400 }}>MUST SEARCH</th>
                      <th style={{ padding: "6px 0 6px 12px", fontWeight: 400 }}>ANSWERED BY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.brands
                      .filter((b) => b.covered + b.uncovered > 0)
                      .map((b) => (
                        <tr key={b.brand} style={{ borderTop: "1px solid var(--line)" }}>
                          <td style={{ padding: "6px 12px 6px 0", color: "var(--text)" }}>{b.brand}</td>
                          <td style={{ padding: "6px 12px" }}>{b.covered + b.uncovered}</td>
                          <td style={{ padding: "6px 12px", color: "var(--accent)" }}>{b.covered}</td>
                          <td style={{ padding: "6px 12px", color: b.uncovered ? "#d8b98a" : undefined }}>
                            {b.uncovered}
                          </td>
                          <td style={{ padding: "6px 0 6px 12px", color: "var(--faint)" }}>
                            {b.answeredBy.map((a) => `${a.host} ${a.rows}`).join(", ") || "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {(running || lines.length > 0) && (
        <div style={{ borderTop: "1px solid var(--line)" }}>
          {progress.total > 0 && (
            <div style={{ height: 2, background: "var(--line)", overflow: "hidden" }}>
              {/* Scaled rather than widened: a compositor-only transform, so the
                  bar cannot cause layout work while a run is streaming events. */}
              <div
                style={{
                  height: "100%",
                  width: "100%",
                  transformOrigin: "left",
                  transform: `scaleX(${Math.min(1, progress.done / progress.total)})`,
                  background: "var(--accent)",
                  transition: "transform .5s cubic-bezier(.2,.8,.2,1)",
                }}
              />
            </div>
          )}

          <div
            ref={logRef}
            className="mono"
            style={{
              maxHeight: 320,
              overflowY: "auto",
              padding: "18px 26px",
              fontSize: 11.5,
              lineHeight: 1.85,
              background: "var(--panel)",
              whiteSpace: "pre-wrap",
            }}
          >
            {lines.map((line) => (
              <div key={line.id} style={{ color: toneColour[line.tone] }}>
                {line.text}
              </div>
            ))}
            {running && <div style={{ color: "var(--faint)" }}>…</div>}
          </div>
        </div>
      )}

      {report && (
        <div
          style={{
            borderTop: "1px solid var(--line)",
            padding: "20px 26px",
            display: "flex",
            gap: 26,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span className="mono" style={{ fontSize: 10.5, letterSpacing: "0.14em", color: "var(--accent)" }}>
            {report.counts.ready} LISTED
          </span>
          <span className="mono" style={{ fontSize: 10.5, letterSpacing: "0.14em", color: "#d8b98a" }}>
            {report.counts.needsReview} NEED REVIEW
          </span>
          {report.counts.failed > 0 && (
            <span className="mono" style={{ fontSize: 10.5, letterSpacing: "0.14em", color: "#e0857a" }}>
              {report.counts.failed} FAILED
            </span>
          )}
          <span className="mono" style={{ fontSize: 10.5, letterSpacing: "0.14em", color: "var(--faint)" }}>
            {report.counts.imagesSaved} IMAGES · ${report.costUsd.toFixed(3)}
          </span>
        </div>
      )}
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label
      className="mono"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        fontSize: 9.5,
        letterSpacing: "0.14em",
        color: checked ? "var(--body)" : "var(--dim)",
        textTransform: "uppercase",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        style={{ accentColor: "#c98a5e", width: 14, height: 14 }}
      />
      {label}
    </label>
  );
}
