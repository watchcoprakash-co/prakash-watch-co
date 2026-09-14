import Reveal from "./Reveal";

const services = [
  { no: "S / 01", t: "Battery & seal", d: "Cell replacement with a fresh gasket and a pressure check, done at the counter while you wait." },
  { no: "S / 02", t: "Full overhaul", d: "Movement stripped, cleaned, lubricated and regulated. Timing sheet handed over with the watch." },
  { no: "S / 03", t: "Bracelet & fit", d: "Sizing, link work, strap changes and refinishing — free for anything bought from us." },
];

export default function Service() {
  return (
    <section id="service" style={{ position: "relative", padding: "130px 44px" }}>
      <Reveal style={{ maxWidth: 760 }}>
        <span className="kicker">03 — The Workshop</span>
        <h2 className="h2" style={{ fontSize: "clamp(40px, 5.6vw, 92px)", margin: "22px 0 0" }}>
          A watch is a<br /><span className="italic-accent">relationship</span>
        </h2>
      </Reveal>
      <Reveal style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, marginTop: 70, background: "var(--line)" }}>
        {services.map((s) => (
          <div key={s.no} className="hover-card" style={{ background: "var(--bg)", padding: "46px 36px 52px" }}>
            <div className="mono" style={{ fontSize: 10.5, letterSpacing: "0.2em", color: "var(--accent)" }}>{s.no}</div>
            <h3 className="serif" style={{ margin: "26px 0 0", fontSize: 32, lineHeight: 1.1, fontWeight: 400 }}>{s.t}</h3>
            <p style={{ margin: "16px 0 0", fontSize: 15, lineHeight: 1.7, fontWeight: 300, color: "var(--muted)" }}>{s.d}</p>
          </div>
        ))}
      </Reveal>
    </section>
  );
}
