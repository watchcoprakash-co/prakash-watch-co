"use client";
import { useEffect, useState } from "react";

const ticks = Array.from({ length: 12 }, (_, i) => i * 30);

export default function WatchFace() {
  const [d, setD] = useState<{ h: number; m: number; s: number } | null>(null);
  useEffect(() => {
    const now = new Date();
    const s = now.getSeconds() + now.getMilliseconds() / 1000;
    const m = now.getMinutes() * 60 + s;
    const h = (now.getHours() % 12) * 3600 + m;
    setD({ h: -h, m: -m, s: -s });
  }, []);
  const hand = (w: number, hgt: number, dur: number, delay: number, bg: string, bottom = 0) => (
    <div style={{ position: "absolute", top: "50%", left: "50%", width: 0, height: 0, animation: `sweep ${dur}s linear infinite`, animationDelay: `${delay}s` }}>
      <div style={{ position: "absolute", bottom, left: -w / 2, width: w, height: hgt, borderRadius: 4, background: bg }} />
    </div>
  );
  return (
    <div style={{
      position: "relative", width: 380, height: 380, borderRadius: 999,
      background: "radial-gradient(circle at 34% 28%, #23201e, #0d0c0b 72%)", border: "1px solid #302b28",
      boxShadow: "0 60px 120px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)",
    }}>
      <div style={{ position: "absolute", inset: 26, borderRadius: 999, border: "1px solid #221f1d", background: "radial-gradient(circle at 50% 40%, #131110, #0a0908)" }}>
        {ticks.map((deg) => (
          <div key={deg} style={{ position: "absolute", inset: 0, transform: `rotate(${deg}deg)` }}>
            <div style={{
              position: "absolute", top: deg % 90 === 0 ? 12 : 14, left: "50%",
              width: deg % 90 === 0 ? 2 : 1, height: deg === 0 ? 14 : deg % 90 === 0 ? 11 : 8,
              marginLeft: deg % 90 === 0 ? -1 : -0.5,
              background: deg === 0 ? "var(--accent)" : deg % 90 === 0 ? "#6f6660" : "#4a4340",
            }} />
          </div>
        ))}
        <div style={{
          position: "absolute", top: "50%", left: "50%", width: 90, height: 26, margin: "-13px 0 0 -45px",
          border: "1px solid #2a2624", borderRadius: 3, transform: "translateX(58px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: "0.16em", color: "var(--muted)" }}>IST</span>
        </div>
        {d && (
          <>
            {hand(6, 78, 43200, d.h, "linear-gradient(180deg, #f2ede8, #9c948e)")}
            {hand(4, 116, 3600, d.m, "linear-gradient(180deg, #f2ede8, #9c948e)")}
            {hand(1, 140, 60, d.s, "var(--accent)", -22)}
          </>
        )}
        <div style={{ position: "absolute", top: "50%", left: "50%", width: 9, height: 9, margin: "-4.5px 0 0 -4.5px", borderRadius: 999, background: "#f2ede8" }} />
      </div>
    </div>
  );
}
