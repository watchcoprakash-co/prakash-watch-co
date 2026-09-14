import type { Metadata } from "next";
import Cursor from "@/components/Cursor";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import ServiceForm from "@/components/ServiceForm";

export const metadata: Metadata = {
  title: "Service & repair — Prakash Watch Co.",
  description:
    "Book a watch into the Prakash Watch Co. workshop. Battery and seal, full overhaul, bracelet work and glass replacement — estimated before anything is opened. Delhi NCR since 1976.",
};

const STEPS = [
  { no: "01", t: "You book it in", d: "Fill the form, or walk into any of the four boutiques. You get a docket number the same minute." },
  { no: "02", t: "We look at it", d: "A watchmaker opens the case, assesses what it needs, and calls you within one working day." },
  { no: "03", t: "You agree the cost", d: "Nothing is started until you say yes to the estimate. If you decline, the watch is closed up and returned." },
  { no: "04", t: "It comes back right", d: "Serviced, timed and pressure-tested. A timing sheet goes back with anything mechanical." },
];

const WORK = [
  { t: "Battery & seal", p: "From ₹450", d: "Cell, fresh gasket, pressure check. Done at the counter while you wait." },
  { t: "Full overhaul", p: "From ₹3,500", d: "Movement stripped, cleaned, lubricated and regulated. Two to three weeks." },
  { t: "Bracelet & fit", p: "Free on ours", d: "Sizing, link work, strap changes, refinishing. No charge on anything bought here." },
  { t: "Glass & crystal", p: "From ₹1,200", d: "Mineral or sapphire replacement, bezel reseating, refitting." },
];

export default function ServicePage() {
  return (
    <main style={{ position: "relative", minHeight: "100vh", background: "var(--bg)", overflow: "hidden" }}>
      <div className="grain" />
      <Cursor />
      <Nav />

      <section style={{ padding: "160px 44px 20px" }}>
        <span className="kicker">03 — The workshop</span>
        <h1 className="h2" style={{ fontSize: "clamp(38px, 5.4vw, 86px)", maxWidth: 980 }}>
          Book a watch<br />
          <span className="italic-accent">into the bench</span>
        </h1>
        <p style={{ maxWidth: 560, margin: "24px 0 0", fontSize: 15.5, lineHeight: 1.75, fontWeight: 300, color: "var(--muted)" }}>
          Fifty years of servicing what we sell, and plenty we did not. Tell us what the watch is doing and we will
          tell you what it needs and what it costs — before anyone opens it.
        </p>
      </section>

      <section style={{ padding: "56px 44px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 1, background: "var(--line)" }}>
          {STEPS.map((step) => (
            <div key={step.no} className="hover-card" style={{ background: "var(--bg)", padding: "34px 28px 40px" }}>
              <span className="mono" style={{ fontSize: 10.5, letterSpacing: "0.2em", color: "var(--accent)" }}>{step.no}</span>
              <h2 className="serif" style={{ margin: "18px 0 0", fontSize: 23, lineHeight: 1.15, fontWeight: 400 }}>{step.t}</h2>
              <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.7, fontWeight: 300, color: "var(--muted)" }}>{step.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "74px 44px 0" }}>
        <span className="kicker">What the bench does</span>
        <div style={{ marginTop: 28, borderTop: "1px solid var(--line)" }}>
          {WORK.map((work) => (
            <div
              key={work.t}
              style={{
                display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.6fr) 130px", gap: 26,
                alignItems: "baseline", padding: "22px 4px", borderBottom: "1px solid var(--line)",
              }}
              className="svc-work"
            >
              <span className="serif" style={{ fontSize: "clamp(20px, 2.2vw, 28px)" }}>{work.t}</span>
              <span style={{ fontSize: 14.5, fontWeight: 300, lineHeight: 1.65, color: "var(--muted)" }}>{work.d}</span>
              <span className="mono" style={{ justifySelf: "end", fontSize: 11.5, letterSpacing: "0.14em", color: "var(--accent)" }}>
                {work.p}
              </span>
            </div>
          ))}
        </div>
        <p style={{ margin: "18px 0 0", fontSize: 13, fontWeight: 300, color: "var(--faint)" }}>
          Indicative. The estimate you agree is the price you pay — we do not revise it once work has started.
        </p>
      </section>

      <section style={{ padding: "86px 44px 120px" }}>
        <div className="svc-layout">
          <div>
            <span className="kicker">The docket</span>
            <h2 className="h2" style={{ fontSize: "clamp(30px, 3.6vw, 54px)", margin: "18px 0 0" }}>
              Tell us what<br />it is <span className="italic-accent">doing</span>
            </h2>
            <p style={{ maxWidth: 340, margin: "22px 0 0", fontSize: 14.5, lineHeight: 1.75, fontWeight: 300, color: "var(--muted)" }}>
              Everything marked with a star is what the workshop genuinely needs. The rest helps, and can wait until
              you drop the watch in.
            </p>
            <div style={{ marginTop: 34, borderTop: "1px solid var(--line)", paddingTop: 22 }}>
              <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--faint)" }}>
                Rather talk to someone
              </span>
              <a
                href="tel:+919899645897"
                className="serif"
                data-hover
                style={{ display: "block", marginTop: 10, fontSize: 26, color: "var(--accent-soft)" }}
              >
                +91 98996 45897
              </a>
            </div>
          </div>

          <ServiceForm />
        </div>
      </section>

      <Footer />
    </main>
  );
}
