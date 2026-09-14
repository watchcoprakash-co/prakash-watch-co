"use client";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

export default function Reveal({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const n = ref.current;
    if (!n) return;
    if (n.getBoundingClientRect().top > innerHeight * 0.9) {
      n.style.opacity = "0";
      n.style.transform = "translateY(34px)";
      n.style.transition = "opacity 1s cubic-bezier(.2,.8,.2,1), transform 1.1s cubic-bezier(.2,.8,.2,1)";
    }
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => {
        if (e.isIntersecting) {
          (e.target as HTMLElement).style.opacity = "1";
          (e.target as HTMLElement).style.transform = "translateY(0)";
          io.unobserve(e.target);
        }
      }),
      { threshold: 0.15 }
    );
    io.observe(n);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} style={style}>{children}</div>;
}
