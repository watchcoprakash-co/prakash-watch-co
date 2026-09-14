import type { Firm } from "@/lib/firm";

/**
 * The block at the top of every printed statement.
 *
 * Registration numbers print only when the firm has actually filled them in — a
 * statutory document showing an invented GSTIN is worse than one showing none,
 * so the gap stays visible until it is corrected in data/firm.json.
 */
export default function Letterhead({
  firm,
  title,
  period,
  note,
}: {
  firm: Firm;
  title: string;
  period?: string;
  note?: string;
}) {
  const registrations = [firm.gstin && `GSTIN ${firm.gstin}`, firm.pan && `PAN ${firm.pan}`].filter(Boolean);

  return (
    <header className="doc-head">
      <div>
        <div className="serif" style={{ fontSize: 22, lineHeight: 1.1 }}>{firm.name}</div>
        {firm.tagline && (
          <div className="mono" style={{ fontSize: 8.5, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--muted)", marginTop: 4 }}>
            {firm.tagline}
          </div>
        )}
        <div style={{ fontSize: 11, fontWeight: 300, color: "var(--dim)", marginTop: 7, lineHeight: 1.7 }}>
          {[firm.address, firm.phone, firm.email].filter(Boolean).join(" · ")}
          {registrations.length > 0 ? <><br />{registrations.join(" · ")}</> : (
            <><br /><span style={{ color: "#d8b98a" }}>GSTIN and PAN not set — fill them in data/firm.json before filing</span></>
          )}
        </div>
      </div>

      <div style={{ textAlign: "right" }}>
        <div className="mono" style={{ fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--faint)" }}>
          {title}
        </div>
        {period && <div className="mono" style={{ fontSize: 12, color: "var(--text)", marginTop: 6 }}>{period}</div>}
        <div className="mono" style={{ fontSize: 9, color: "var(--dim)", marginTop: 5 }}>
          Generated {new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
        </div>
        {note && <div className="mono" style={{ fontSize: 8.5, color: "#d8b98a", marginTop: 4 }}>{note}</div>}
      </div>
    </header>
  );
}
