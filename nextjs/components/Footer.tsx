"use client";
import { useEffect, useState } from "react";

export default function Footer() {
  const [t, setT] = useState("--:--:--");
  useEffect(() => {
    const tick = () => setT(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <footer style={{ position: "relative", padding: "110px 44px 40px", borderTop: "1px solid var(--line2)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 50, paddingBottom: 90 }}>
        <div>
          <div className="serif" style={{ fontSize: "clamp(34px, 4vw, 62px)", lineHeight: 1, letterSpacing: "-0.02em" }}>
            Set your watch<br /><span className="italic-accent">with us</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 40 }}>
            <span className="mono" style={{ fontSize: 44, letterSpacing: "0.02em" }}>{t}</span>
            <span className="mono" style={{ fontSize: 10.5, letterSpacing: "0.2em", color: "var(--dim)" }}>INDIA<br />STANDARD<br />TIME</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 15, fontWeight: 300, color: "var(--body)" }}>
          <span className="kicker" style={{ letterSpacing: "0.24em" }}>Reach us</span>
          <a href="mailto:prakashwatchco@gmail.com">prakashwatchco@gmail.com</a>
          <a href="tel:+919899645897">+91 98996 45897</a>
          <a href="https://www.instagram.com/prakashwatchco/" target="_blank" rel="noreferrer">Instagram — 74K</a>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 15, fontWeight: 300, color: "var(--body)" }}>
          <span className="kicker" style={{ letterSpacing: "0.24em" }}>Explore</span>
          <a href="#collection">Collection</a>
          <a href="#service">Service & repair</a>
          <a href="#boutiques">Boutiques</a>
        </div>
      </div>
      <div className="mono" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--line2)",
        paddingTop: 22, fontSize: 10, letterSpacing: "0.2em", color: "var(--faint)", textTransform: "uppercase",
      }}>
        <span>PRAKASH WATCH CO. — DELHI NCR</span>
        <span>DEMO CONCEPT · CONTENT INDICATIVE</span>
      </div>
    </footer>
  );
}
