import Reveal from "./Reveal";

const stores = [
  { t: "Dwarka", a: ["G5 & G6, Aggarwal Arcade", "Sector 12, Dwarka, New Delhi"], tag: "FLAGSHIP", accent: true },
  { t: "Sadar Bazar", a: ["No. 1277, Roshan Pura", "Sadar Bazar, Gurugram"], tag: "SINCE 1976", accent: false },
  { t: "West Delhi", a: ["Multi-brand counter", "Address to confirm"], tag: "RETAIL", accent: false },
  { t: "Service Centre", a: ["Workshop & warranty desk", "Address to confirm"], tag: "WORKSHOP", accent: true },
];

export default function Boutiques() {
  return (
    <section id="boutiques" style={{ position: "relative", padding: "120px 44px", background: "var(--panel)", borderTop: "1px solid var(--line2)" }}>
      <Reveal style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 58 }}>
        <div>
          <span className="kicker">04 — Boutiques</span>
          <h2 className="h2" style={{ fontSize: "clamp(38px, 4.6vw, 74px)", lineHeight: 0.95 }}>Come in and try it on</h2>
        </div>
        <span className="mono" style={{ fontSize: 11, letterSpacing: "0.18em", color: "var(--muted)" }}>DAILY 10:00 — 21:00</span>
      </Reveal>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1, background: "var(--line)" }}>
        {stores.map((s) => (
          <div key={s.t} className="hover-card" style={{ background: "var(--card)", padding: "40px 34px", display: "flex", justifyContent: "space-between", gap: 24 }}>
            <div>
              <h3 className="serif" style={{ margin: 0, fontSize: 30, fontWeight: 400 }}>{s.t}</h3>
              <p style={{ margin: "12px 0 0", fontSize: 14.5, lineHeight: 1.65, fontWeight: 300, color: "var(--muted)" }}>
                {s.a[0]}<br />{s.a[1]}
              </p>
            </div>
            <span className="mono" style={{ fontSize: 10.5, letterSpacing: "0.2em", color: s.accent ? "var(--accent)" : "var(--dim)" }}>{s.tag}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
