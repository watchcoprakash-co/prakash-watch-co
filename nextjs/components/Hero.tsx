import WatchFace from "./WatchFace";

export default function Hero() {
  return (
    <section id="top" style={{
      position: "relative", minHeight: "100vh", display: "grid", gridTemplateColumns: "1.15fr 0.85fr",
      alignItems: "center", gap: 40, padding: "150px 44px 60px",
    }}>
      <div style={{
        position: "absolute", top: "12%", right: "8%", width: 620, height: 620, borderRadius: 999,
        background: "radial-gradient(circle, oklch(0.72 0.14 34 / 0.16), transparent 62%)", filter: "blur(30px)", pointerEvents: "none",
      }} />
      <div style={{ position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 34 }}>
          <span style={{ width: 54, height: 1, background: "var(--accent)" }} />
          <span className="kicker" style={{ color: "#a89f98" }}>Delhi NCR · Four Boutiques</span>
        </div>
        <h1 className="serif" style={{ margin: 0, fontSize: "clamp(56px, 9.2vw, 158px)", lineHeight: 0.85, letterSpacing: "-0.025em" }}>
          Time,<br /><span className="italic-accent">kept</span> well.
        </h1>
        <p style={{ maxWidth: 460, margin: "40px 0 0", fontSize: 17.5, lineHeight: 1.65, fontWeight: 300, color: "var(--body)", textWrap: "pretty" }}>
          Since 1976 we have sold, set and serviced fine watches across Delhi and Gurugram. Authorized
          retail for the houses that matter — and a workshop that keeps them running long after the sale.
        </p>
        <div style={{ display: "flex", gap: 14, marginTop: 46 }}>
          <a className="btn btn-solid" href="#collection">Browse the collection</a>
          <a className="btn btn-ghost" href="#service">Book a service</a>
        </div>
      </div>
      <div style={{ position: "relative", zIndex: 2, display: "flex", justifyContent: "center", alignItems: "center" }}>
        <WatchFace />
      </div>
      <div style={{
        position: "absolute", bottom: 34, left: 44, right: 44, display: "flex", alignItems: "flex-end",
        justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 18,
      }}>
        <div className="mono" style={{ display: "flex", gap: 56, fontSize: 10.5, letterSpacing: "0.2em", color: "var(--dim)", textTransform: "uppercase" }}>
          <span>50 Years of Service</span>
          <span>20+ Authorized Houses</span>
          <span>In-house Workshop</span>
        </div>
        <div className="mono" style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 10.5, letterSpacing: "0.2em", color: "var(--dim)" }}>
          <span>SCROLL</span>
          <span style={{ position: "relative", display: "block", width: 1, height: 46, background: "var(--line)", overflow: "hidden" }}>
            <span style={{ position: "absolute", top: 0, left: 0, width: 1, height: 14, background: "var(--accent)", animation: "drop 2.2s ease-in-out infinite" }} />
          </span>
        </div>
      </div>
    </section>
  );
}
