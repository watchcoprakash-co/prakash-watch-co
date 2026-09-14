import { formatInr } from "@/agent/format";

/**
 * Charts for the stock room.
 *
 * Hand-drawn SVG, three rules throughout:
 *
 *  1. Every value is written as text, not only drawn. A shape answers "which is
 *     biggest"; the shop also needs "how much", and needs it on a printout.
 *  2. No pie charts. Slices carry meaning in colour alone, which fails for
 *     colourblind readers — proportions are shown as stacked bars instead.
 *  3. Every chart carries a data table behind a disclosure, so the figures can be
 *     read, copied and checked by a screen reader.
 */

export interface Datum {
  label: string;
  value: number;
  /** Optional second measure drawn alongside, e.g. units sold against units held. */
  compare?: number;
  hint?: string;
}

const money = (n: number) => formatInr(n);
const plain = (n: number) => new Intl.NumberFormat("en-IN").format(Math.round(n));

/** Distinguishable without relying on hue alone — every band is labelled too. */
export const SERIES = ["var(--accent)", "#8a6a52", "#5f6f72", "#7a6f8a", "#6f7a5f", "#8a7a5f"];

function DataTable({ rows, unit }: { rows: Datum[]; unit: "money" | "count" }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <details className="ops-noprint" style={{ marginTop: 10 }}>
      <summary className="mono" style={{ cursor: "pointer", fontSize: 9, letterSpacing: ".14em", color: "var(--dim)", textTransform: "uppercase" }}>
        Figures
      </summary>
      <table className="ops-table" style={{ marginTop: 8 }}>
        <thead><tr><th>Item</th><th style={{ textAlign: "right" }}>Value</th><th style={{ textAlign: "right" }}>Share</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td className="ops-num">{unit === "money" ? money(row.value) : plain(row.value)}</td>
              <td className="ops-num" style={{ color: "var(--dim)" }}>{total ? ((row.value / total) * 100).toFixed(0) : 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function ChartFrame({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="ops-panel">
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <h3 className="mono" style={{ margin: 0, fontSize: 9.5, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 400 }}>
          {title}
        </h3>
        {note && <span className="mono" style={{ fontSize: 10, color: "var(--dim)" }}>{note}</span>}
      </header>
      {children}
    </section>
  );
}

/** Ranked comparison. Horizontal because category names read better on one line. */
export function RankedBars({ rows, unit = "money", max }: { rows: Datum[]; unit?: "money" | "count"; max?: number }) {
  if (!rows.length) return <Nothing />;
  const peak = max ?? Math.max(...rows.map((r) => Math.max(r.value, r.compare ?? 0)), 1);

  return (
    <>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((row) => (
          <li key={row.label}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, fontWeight: 300, marginBottom: 5 }}>
              <span style={{ color: "var(--body)" }}>{row.label}</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                {unit === "money" ? money(row.value) : plain(row.value)}
                {row.hint && <span style={{ color: "var(--dim)" }}> · {row.hint}</span>}
              </span>
            </div>
            <div style={{ height: row.compare !== undefined ? 3 : 4, background: "var(--line)" }}>
              <div style={{ height: "100%", width: `${(row.value / peak) * 100}%`, background: "var(--accent)" }} />
            </div>
            {row.compare !== undefined && (
              <div style={{ height: 3, background: "var(--line)", marginTop: 2 }} title={`Sold ${plain(row.compare)}`}>
                <div style={{ height: "100%", width: `${(row.compare / peak) * 100}%`, background: "#8a6a52" }} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <DataTable rows={rows} unit={unit} />
    </>
  );
}

/** Distribution across ordered buckets — price bands, case sizes, depth ratings. */
export function Columns({ rows, unit = "count" }: { rows: Datum[]; unit?: "money" | "count" }) {
  if (!rows.length) return <Nothing />;
  const peak = Math.max(...rows.map((r) => r.value), 1);
  const height = 128;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${rows.length}, 1fr)`, gap: 8, alignItems: "end", height }}>
        {rows.map((row) => (
          <div key={row.label} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}
            title={`${row.label}: ${unit === "money" ? money(row.value) : plain(row.value)}`}>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--text)", textAlign: "center", marginBottom: 5, fontVariantNumeric: "tabular-nums" }}>
              {row.value > 0 ? (unit === "money" ? money(row.value) : plain(row.value)) : ""}
            </span>
            <div style={{
              height: `${Math.max(2, (row.value / peak) * (height - 42))}px`,
              background: row.value > 0 ? "var(--accent)" : "var(--line)",
              opacity: row.value > 0 ? 0.9 : 1,
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${rows.length}, 1fr)`, gap: 8, marginTop: 7 }}>
        {rows.map((row) => (
          <span key={row.label} className="mono" style={{ fontSize: 8.5, letterSpacing: ".06em", color: "var(--dim)", textAlign: "center", textTransform: "uppercase" }}>
            {row.label}
          </span>
        ))}
      </div>
      <DataTable rows={rows} unit={unit} />
    </>
  );
}

/**
 * Composition, as one stacked bar with a labelled legend.
 *
 * This is the pie chart's job done accessibly: the bar shows proportion, and the
 * legend states every share as a number so nothing depends on telling two
 * similar colours apart.
 */
export function Composition({ rows, unit = "count" }: { rows: Datum[]; unit?: "money" | "count" }) {
  if (!rows.length) return <Nothing />;
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;

  return (
    <>
      <div style={{ display: "flex", height: 12, border: "1px solid var(--line)", overflow: "hidden" }}
        role="img" aria-label={rows.map((r) => `${r.label} ${((r.value / total) * 100).toFixed(0)}%`).join(", ")}>
        {rows.map((row, index) => (
          <div key={row.label} style={{ width: `${(row.value / total) * 100}%`, background: SERIES[index % SERIES.length] }}
            title={`${row.label}: ${plain(row.value)} (${((row.value / total) * 100).toFixed(0)}%)`} />
        ))}
      </div>
      <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((row, index) => (
          <li key={row.label} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, fontWeight: 300 }}>
            <span aria-hidden style={{ width: 9, height: 9, flex: "0 0 9px", background: SERIES[index % SERIES.length] }} />
            <span style={{ color: "var(--body)", flex: 1 }}>{row.label}</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {unit === "money" ? money(row.value) : plain(row.value)}
              <span style={{ color: "var(--dim)" }}> · {((row.value / total) * 100).toFixed(0)}%</span>
            </span>
          </li>
        ))}
      </ul>
      <DataTable rows={rows} unit={unit} />
    </>
  );
}

/** Time series with the axis written out. Falls back to a message when flat. */
export function Series({ points, unit = "money", height = 150 }: {
  points: Array<{ label: string; date: string; value: number }>;
  unit?: "money" | "count";
  height?: number;
}) {
  if (points.length < 2) return <Nothing />;
  const peak = Math.max(...points.map((p) => p.value), 1);
  const width = 680;
  const step = width / (points.length - 1);
  const y = (v: number) => height - 16 - (v / peak) * (height - 34);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const any = points.some((p) => p.value > 0);
  const total = points.reduce((s, p) => s + p.value, 0);

  return (
    <>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img"
        aria-label={`${points.length} periods, total ${unit === "money" ? money(total) : plain(total)}, peak ${unit === "money" ? money(peak) : plain(peak)}`}
        style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id="seriesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.5, 1].map((f) => (
          <g key={f}>
            <line x1="0" x2={width} y1={y(peak * f)} y2={y(peak * f)} stroke="var(--line2)" strokeWidth="1" />
            <text x="0" y={y(peak * f) - 4} fill="var(--faint)" fontSize="9" fontFamily="var(--font-mono), monospace">
              {unit === "money" ? money(peak * f) : plain(peak * f)}
            </text>
          </g>
        ))}
        {any && <path d={`${line} L${width},${height} L0,${height} Z`} fill="url(#seriesFill)" />}
        <path d={line} fill="none" stroke={any ? "var(--accent)" : "var(--line)"} strokeWidth="1.6" strokeLinejoin="round" />
        {points.map((p, i) => p.value > 0 && (
          <circle key={p.date} cx={i * step} cy={y(p.value)} r="3" fill="var(--accent)">
            <title>{`${p.label}: ${unit === "money" ? money(p.value) : plain(p.value)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 9, letterSpacing: ".12em", color: "var(--faint)", textTransform: "uppercase", marginTop: 8 }}>
        <span>{points[0].label}</span>
        <span>total {unit === "money" ? money(total) : plain(total)}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </>
  );
}

function Nothing() {
  return <p style={{ margin: 0, fontSize: 12.5, fontWeight: 300, color: "var(--dim)" }}>Not enough data yet.</p>;
}
