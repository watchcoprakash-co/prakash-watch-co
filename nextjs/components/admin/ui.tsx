import Link from "next/link";
import { formatInr } from "@/agent/format";

/* Icons are inline SVG rather than an icon font or emoji: they inherit colour,
   scale with the type, and carry no network cost. Stroke matches the hairline
   borders used everywhere else in the shell. */
const icon = (path: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {path}
  </svg>
);

export const Icons = {
  overview: icon(<><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></>),
  inventory: icon(<><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 12l9 4 9-4" /><path d="M3 17l9 4 9-4" /></>),
  billing: icon(<><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" /><path d="M9 7h6M9 11h6M9 15h4" /></>),
  catalogue: icon(<><circle cx="12" cy="12" r="7" /><path d="M12 8v4l2.5 2.5" /></>),
  chart: icon(<><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></>),
  books: icon(<><path d="M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2z" /><path d="M8 7h8M8 11h8M8 15h5" /></>),
  runs: icon(<><path d="M12 3a9 9 0 109 9" /><path d="M12 3v9l6 3" /></>),
  plus: icon(<><path d="M12 5v14M5 12h14" /></>),
  download: icon(<><path d="M12 3v12" /><path d="M7 12l5 5 5-5" /><path d="M4 21h16" /></>),
  print: icon(<><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="1" /><path d="M8 17h8v4H8z" /></>),
  up: icon(<><path d="M12 19V5M6 11l6-6 6 6" /></>),
  down: icon(<><path d="M12 5v14M6 13l6 6 6-6" /></>),
  alert: icon(<><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></>),
  repairs: icon(<><path d="M14.7 6.3a4 4 0 01-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 015.4-5.4l-2.6 2.6-2.1-2.1 2.7-2.5z" /></>),
  sources: icon(<><path d="M4 19.5V5a2 2 0 012-2h13v18H6a2 2 0 01-2-1.5z" /><path d="M9.5 8.5h5M9.5 12h5" /><circle cx="7" cy="8.5" r=".6" fill="currentColor" /><circle cx="7" cy="12" r=".6" fill="currentColor" /></>),
  pricing: icon(<><path d="M3 17l6-6 4 4 8-8" /><path d="M21 7v5h-5" /><path d="M3 21h18" /></>),
  offers: icon(<><path d="M20.6 13.4L12 22l-9-9V4a1 1 0 011-1h8.6l8 8a1.4 1.4 0 010 2.4z" /><path d="M7.5 7.5h.01" /></>),
};

export function PageHead({ title, lead, action }: { title: string; lead?: string; action?: React.ReactNode }) {
  return (
    <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, marginBottom: 24, flexWrap: "wrap" }}>
      <div>
        <h1 className="serif" style={{ margin: 0, fontSize: 30, fontWeight: 400, lineHeight: 1.1 }}>{title}</h1>
        {lead && <p style={{ margin: "8px 0 0", fontSize: 13.5, fontWeight: 300, color: "var(--muted)", maxWidth: 620 }}>{lead}</p>}
      </div>
      {action}
    </header>
  );
}

/**
 * One headline number.
 *
 * The change figure is stated in words as well as colour — "up 12% on last
 * month" — because a red or green tint alone is invisible to a good share of
 * readers and meaningless on a printout.
 */
export function Stat({
  label,
  value,
  sub,
  delta,
  tone = "plain",
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: { pct: number; label: string } | null;
  tone?: "plain" | "accent" | "warn";
}) {
  const colour = tone === "accent" ? "var(--accent-soft)" : tone === "warn" ? "#d8b98a" : "var(--text)";
  const rising = (delta?.pct ?? 0) >= 0;

  return (
    <div className="ops-card">
      <div className="mono" style={{ fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--faint)" }}>{label}</div>
      <div className="mono" style={{ fontSize: 25, marginTop: 10, color: colour, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, fontWeight: 300, color: "var(--dim)", marginTop: 6 }}>{sub}</div>}
      {delta && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, fontSize: 11.5, fontWeight: 300, color: rising ? "var(--accent)" : "#e0857a" }}>
          {rising ? Icons.up : Icons.down}
          <span>{Math.abs(delta.pct).toFixed(0)}% {rising ? "up" : "down"} {delta.label}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Revenue over time.
 *
 * Hand-drawn SVG rather than a charting dependency — one series of thirty points
 * does not justify 40kB of library, and this way it inherits the theme exactly.
 * The peak and the total are printed beside it so the shape is never the only
 * way to read the data.
 */
export function TrendChart({ points, height = 132 }: { points: Array<{ label: string; date: string; value: number }>; height?: number }) {
  if (points.length < 2) return null;

  const width = 640;
  const peak = Math.max(...points.map((p) => p.value), 1);
  const step = width / (points.length - 1);
  const y = (value: number) => height - 12 - (value / peak) * (height - 28);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const hasSales = points.some((p) => p.value > 0);

  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img"
        aria-label={`Revenue for the last ${points.length} days. Highest day ${formatInr(peak)}.`}
        style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={width} y1={height - 12 - f * (height - 28)} y2={height - 12 - f * (height - 28)} stroke="var(--line2)" strokeWidth="1" />
        ))}
        {hasSales && <path d={area} fill="url(#revFill)" />}
        <path d={line} fill="none" stroke={hasSales ? "var(--accent)" : "var(--line)"} strokeWidth="1.6" strokeLinejoin="round" />
        {points.map((p, i) => p.value > 0 && (
          <circle key={p.date} cx={i * step} cy={y(p.value)} r="2.5" fill="var(--accent)">
            <title>{`${p.label}: ${formatInr(p.value)}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 9, letterSpacing: ".14em", color: "var(--faint)", textTransform: "uppercase", marginTop: 8 }}>
        <span>{points[0].label}</span>
        <span>peak {formatInr(peak)}</span>
        <span>{points[points.length - 1].label}</span>
      </figcaption>
    </figure>
  );
}

/** A proportion bar with its numbers written out beside it. */
export function Bar({ label, value, total, hint }: { label: string; value: number; total: number; hint?: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, fontWeight: 300, color: "var(--body)", marginBottom: 5 }}>
        <span>{label}</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{hint ?? `${pct.toFixed(0)}%`}</span>
      </div>
      <div style={{ height: 3, background: "var(--line)" }}>
        <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: "var(--accent)" }} />
      </div>
    </div>
  );
}

export function Empty({ title, body, href, cta }: { title: string; body: string; href?: string; cta?: string }) {
  return (
    <div className="ops-panel" style={{ textAlign: "center", padding: "48px 24px" }}>
      <p className="serif" style={{ fontSize: 22, margin: 0 }}>{title}</p>
      <p style={{ margin: "10px auto 0", fontSize: 13.5, fontWeight: 300, color: "var(--muted)", maxWidth: 420, lineHeight: 1.6 }}>{body}</p>
      {href && cta && (
        <Link href={href} className="ops-btn" data-variant="solid" style={{ marginTop: 20 }}>{cta}</Link>
      )}
    </div>
  );
}

export { formatInr };
