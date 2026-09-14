"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Reveal from "./Reveal";
import type { CollectionSummary } from "@/lib/catalog";

/**
 * The homepage index. The hover-peek now shows the real primary photograph of a
 * watch in that family, falling back to the striped placeholder while a family
 * is still empty.
 */
export default function Collection({ families }: { families: CollectionSummary[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const peek = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cx = 0, cy = 0, x = 0, y = 0, raf = 0, seeded = false;
    const move = (e: MouseEvent) => {
      cx = e.clientX; cy = e.clientY;
      if (!seeded) { x = cx; y = cy; seeded = true; }
    };
    const loop = () => {
      x += (cx - x) * 0.09; y += (cy - y) * 0.09;
      if (peek.current) { peek.current.style.left = `${x}px`; peek.current.style.top = `${y}px`; }
      raf = requestAnimationFrame(loop);
    };
    addEventListener("mousemove", move, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => { removeEventListener("mousemove", move); cancelAnimationFrame(raf); };
  }, []);

  const total = families.reduce((sum, family) => sum + family.count, 0);
  const active = hover === null ? null : families[hover];

  return (
    <section id="collection" style={{ position: "relative", padding: "130px 44px 120px" }}>
      <Reveal style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 66 }}>
        <div>
          <span className="kicker">01 — The Index</span>
          <h2 className="h2" style={{ fontSize: "clamp(40px, 5.6vw, 92px)" }}>
            Six ways to<br /><span className="italic-accent">wear</span> a movement
          </h2>
        </div>
        <p style={{ maxWidth: 320, margin: 0, fontSize: 15.5, lineHeight: 1.7, fontWeight: 300, color: "var(--muted)" }}>
          {total > 0
            ? `Hover a line to see the case. ${total} reference${total === 1 ? "" : "s"} stocked, sized and warranted in store.`
            : "Hover a line to see the case. Every reference below is stocked, sized and warranted in store."}
        </p>
      </Reveal>

      <div style={{ borderTop: "1px solid var(--line)" }} onMouseLeave={() => setHover(null)}>
        {families.map((family, i) => (
          <Link
            key={family.id}
            href={`/collections?family=${family.id}`}
            className="row"
            data-hover
            onMouseEnter={() => setHover(i)}
            style={{
              display: "grid", gridTemplateColumns: "76px 1.5fr 1fr 150px", alignItems: "center", gap: 24,
              padding: "30px 8px", borderBottom: "1px solid var(--line)",
              transition: "background-color .4s, padding-left .4s",
            }}
          >
            <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>{family.no}</span>
            <span className="serif" style={{ fontSize: "clamp(28px, 3vw, 46px)", lineHeight: 1, letterSpacing: "-0.01em" }}>{family.name}</span>
            <span style={{ fontSize: 14.5, fontWeight: 300, color: "var(--muted)" }}>{family.note}</span>
            <span
              className="mono"
              style={{
                justifySelf: "end",
                fontSize: 11,
                letterSpacing: "0.18em",
                color: family.count > 0 ? "var(--accent)" : "var(--faint)",
              }}
            >
              {family.count > 0 ? `${family.count} IN STOCK` : "ASK IN STORE"}
            </span>
          </Link>
        ))}
      </div>

      <div ref={peek} style={{
        position: "fixed", top: 0, left: 0, zIndex: 40, width: 300, height: 380, margin: "-190px 0 0 -150px",
        pointerEvents: "none", opacity: hover === null ? 0 : 1, transform: hover === null ? "scale(0.9)" : "scale(1)",
        transition: "opacity .35s, transform .5s cubic-bezier(.2,.8,.2,1)", border: "1px solid #2a2624",
        backgroundColor: "#100e0d",
        backgroundImage: active?.image ? undefined : "repeating-linear-gradient(135deg, #191614 0 2px, #100e0d 2px 9px)",
        display: "flex", alignItems: "flex-end", padding: 18, overflow: "hidden",
      }}>
        {active?.image && (
          <Image
            src={active.image}
            alt=""
            fill
            sizes="300px"
            style={{ objectFit: "contain", padding: 22 }}
          />
        )}
        <span className="mono" style={{
          position: "relative", fontSize: 10, letterSpacing: "0.2em", color: "var(--muted)", textTransform: "uppercase",
        }}>
          {active ? `${active.name} — ${active.count > 0 ? "view the shelf" : "coming in"}` : "product shot"}
        </span>
      </div>
    </section>
  );
}
