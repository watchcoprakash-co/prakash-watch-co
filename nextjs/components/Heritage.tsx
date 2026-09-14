import Reveal from "./Reveal";

const stats = [
  { n: "04", l: "Boutiques in Delhi NCR" },
  { n: "20+", l: "Authorized brands" },
  { n: "74K", l: "Following on Instagram" },
  { n: "1:1", l: "Every sale, one advisor" },
];

export default function Heritage() {
  return (
    <section id="heritage" style={{ position: "relative", padding: "120px 44px", background: "var(--panel)", borderTop: "1px solid var(--line2)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 90, alignItems: "center" }}>
        <Reveal>
          <span className="kicker">02 — Heritage</span>
          <div className="serif" style={{ margin: "26px 0 0", fontSize: "clamp(96px, 15vw, 230px)", lineHeight: 0.8, letterSpacing: "-0.04em" }}>1976</div>
          <p style={{ maxWidth: 480, margin: "42px 0 0", fontSize: 17, lineHeight: 1.7, fontWeight: 300, color: "var(--body)", textWrap: "pretty" }}>
            One counter in Sadar Bazar, Gurgaon. Fifty years later the family runs four multi-brand
            boutiques across Delhi NCR, an authorized service centre, and a following of more than
            seventy thousand people who come to us before they buy.
          </p>
          <p style={{ maxWidth: 480, margin: "22px 0 0", fontSize: 17, lineHeight: 1.7, fontWeight: 300, color: "var(--body)", textWrap: "pretty" }}>
            The trade changed. The habit did not: know the movement, price it honestly, stand behind it afterwards.
          </p>
        </Reveal>
        <Reveal style={{ display: "grid", gap: 1, background: "var(--line)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
            {stats.slice(0, 2).map((s) => (
              <div key={s.n} style={{ background: "var(--card)", padding: "40px 32px" }}>
                <div className="serif" style={{ fontSize: 62, lineHeight: 1, color: "var(--accent-soft)" }}>{s.n}</div>
                <div style={{ marginTop: 12, fontSize: 14, color: "var(--muted)", fontWeight: 300 }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
            {stats.slice(2).map((s) => (
              <div key={s.n} style={{ background: "var(--card)", padding: "40px 32px" }}>
                <div className="serif" style={{ fontSize: 62, lineHeight: 1, color: "var(--accent-soft)" }}>{s.n}</div>
                <div style={{ marginTop: 12, fontSize: 14, color: "var(--muted)", fontWeight: 300 }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "var(--card)", padding: "34px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
            <span style={{ fontSize: 14.5, fontWeight: 300, color: "var(--body)" }}>Warranty and after-sales handled in house</span>
            <span className="mono" style={{ fontSize: 10.5, letterSpacing: "0.2em", color: "var(--accent)" }}>VERIFIED</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
