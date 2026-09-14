"use client";
import { useEffect, useRef } from "react";

export default function Cursor() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(pointer: coarse)").matches) return;
    let cx = innerWidth / 2, cy = innerHeight / 2, x = cx, y = cy, raf = 0;
    const move = (e: MouseEvent) => {
      cx = e.clientX; cy = e.clientY;
      el.style.opacity = "1";
      const t = (e.target as Element).closest?.("a, [data-hover]");
      const big = !!t;
      el.style.width = big ? "62px" : "34px";
      el.style.height = big ? "62px" : "34px";
      el.style.margin = big ? "-31px 0 0 -31px" : "-17px 0 0 -17px";
      el.style.backgroundColor = big ? "oklch(0.72 0.14 34 / 0.16)" : "transparent";
    };
    const loop = () => {
      x += (cx - x) * 0.18; y += (cy - y) * 0.18;
      el.style.transform = `translate3d(${x}px,${y}px,0)`;
      raf = requestAnimationFrame(loop);
    };
    addEventListener("mousemove", move, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => { removeEventListener("mousemove", move); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div ref={ref} style={{
      position: "fixed", top: 0, left: 0, width: 34, height: 34, margin: "-17px 0 0 -17px",
      border: "1px solid oklch(0.72 0.14 34 / 0.7)", borderRadius: 999, pointerEvents: "none", zIndex: 70,
      transition: "width .25s cubic-bezier(.2,.8,.2,1), height .25s cubic-bezier(.2,.8,.2,1), margin .25s cubic-bezier(.2,.8,.2,1), background-color .25s, opacity .3s",
      opacity: 0, mixBlendMode: "difference",
    }} />
  );
}
