"use client";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import Reveal from "./Reveal";
import type { BrandSummary } from "@/lib/brands";

/**
 * The house rail: every brand the shop carries, as a wordmark you can walk along.
 *
 * A light chip on a dark page, because a brand rail is a navigation affordance
 * before it is decoration — it has to be the first thing the eye finds. The
 * treatment follows `.btn-solid`, which already inverts to the warm off-white,
 * so the rail reads as part of the house rather than a borrowed component.
 *
 * Wordmarks are set in type unless the shop supplies a logo file. That is a
 * deliberate default: a brand's real logo, well reproduced, is better than type —
 * but type is far better than a low-resolution logo scraped off a search result.
 */
export default function BrandRail({ brands }: { brands: BrandSummary[] }) {
  const track = useRef<HTMLDivElement>(null);
  // Starts assuming overflow: start-aligned is never wrong, whereas centring an
  // overflowing rail clips the leading mark somewhere it cannot be scrolled back to.
  const [edges, setEdges] = useState({ start: false, end: false, overflows: true });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    // A pixel of tolerance: sub-pixel scroll widths would otherwise leave the
    // arrow lit at the very end of the track.
    setEdges({
      start: el.scrollLeft > 1,
      end: el.scrollLeft < el.scrollWidth - el.clientWidth - 1,
      overflows: el.scrollWidth > el.clientWidth + 1,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = track.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      removeEventListener("resize", measure);
    };
  }, [measure]);

  const nudge = (direction: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    // Roughly a screenful, so a click always lands on a fresh set of marks.
    el.scrollBy({ left: direction * Math.max(el.clientWidth * 0.8, 260), behavior: "smooth" });
  };

  if (brands.length === 0) return null;

  return (
    <section id="brands" style={{ position: "relative", padding: "118px 0 104px" }}>
      <Reveal
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 32,
          flexWrap: "wrap",
          padding: "0 44px",
          marginBottom: 54,
        }}
      >
        <div>
          <span className="kicker">02 — The houses</span>
          <h2 className="h2" style={{ fontSize: "clamp(38px, 5.2vw, 84px)" }}>
            Brands we are<br />
            <span className="italic-accent">authorised</span> to sell
          </h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <p style={{ maxWidth: 260, margin: 0, fontSize: 14.5, lineHeight: 1.7, fontWeight: 300, color: "var(--muted)" }}>
            Every piece comes with the maker&rsquo;s own warranty card, stamped in store.
          </p>
          {/* Arrows only exist while there is somewhere to go. A permanently dead
              control is worse than no control at all. */}
          {edges.overflows && (
            <div style={{ display: "flex", gap: 8 }}>
              <RailButton dir="prev" enabled={edges.start} onClick={() => nudge(-1)} />
              <RailButton dir="next" enabled={edges.end} onClick={() => nudge(1)} />
            </div>
          )}
        </div>
      </Reveal>

      <div style={{ position: "relative" }}>
        <div
          ref={track}
          onScroll={measure}
          className="brand-rail"
          style={{
            display: "flex",
            gap: 30,
            overflowX: "auto",
            scrollSnapType: "x proximity",
            padding: "10px 44px 4px",
            scrollbarWidth: "none",
            // Centred while the shop carries a handful of houses, start-aligned
            // once the rail overflows. Decided from the measurement rather than
            // with `safe center`, whose support is too uneven to trust with a
            // mark that would otherwise be clipped out of reach.
            justifyContent: edges.overflows ? "flex-start" : "center",
          }}
        >
          {brands.map((brand) => (
            <BrandChip key={brand.slug} brand={brand} />
          ))}

          <Link
            href="/brands"
            className="brand-chip"
            style={{ scrollSnapAlign: "start", flex: "none", textAlign: "center", width: 148 }}
          >
            <span
              className="brand-disc"
              style={{
                display: "grid",
                placeItems: "center",
                width: 148,
                height: 148,
                borderRadius: "50%",
                border: "1px solid var(--border)",
                background: "var(--card)",
              }}
            >
              <span
                className="mono"
                style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--body)", lineHeight: 1.6 }}
              >
                All
                <br />
                brands
              </span>
            </span>
            <span
              className="mono brand-name"
              style={{ display: "block", marginTop: 26, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--dim)" }}
            >
              View every house
            </span>
          </Link>
        </div>

        {/* Edge fades, so a cut-off mark reads as "there is more" rather than as a crop. */}
        <Fade side="left" show={edges.start} />
        <Fade side="right" show={edges.end} />
      </div>
    </section>
  );
}

function BrandChip({ brand }: { brand: BrandSummary }) {
  return (
    <Link
      href={`/brands/${brand.slug}`}
      className="brand-chip"
      data-hover
      style={{ scrollSnapAlign: "start", flex: "none", width: 148, textAlign: "center" }}
      aria-label={`${brand.name} — ${brand.inStock} in stock`}
    >
      <span style={{ position: "relative", display: "block" }}>
        <span
          className="brand-disc"
          style={{
            display: "grid",
            placeItems: "center",
            width: 148,
            height: 148,
            borderRadius: "50%",
            background: "var(--text)",
            padding: brand.logo ? 30 : 18,
            overflow: "hidden",
          }}
        >
          {brand.logo ? (
            <Image src={brand.logo} alt={brand.name} width={110} height={44} style={{ width: "100%", height: "auto", objectFit: "contain" }} />
          ) : (
            <span
              style={{
                fontSize: brand.name.length > 8 ? 15 : 19,
                fontWeight: 500,
                letterSpacing: brand.name.length > 8 ? "0.06em" : "0.1em",
                lineHeight: 1.1,
                color: "var(--bg)",
                textTransform: "uppercase",
                wordBreak: "break-word",
              }}
            >
              {brand.name}
            </span>
          )}
        </span>

        {brand.badge && (
          <span
            className="mono"
            style={{
              position: "absolute",
              left: "50%",
              bottom: -9,
              transform: "translateX(-50%)",
              padding: "4px 10px",
              borderRadius: 999,
              background: "var(--accent)",
              color: "#12100f",
              fontSize: 8.5,
              fontWeight: 500,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {brand.badge}
          </span>
        )}
      </span>

      <span
        className="mono brand-name"
        style={{
          display: "block",
          // Constant, badge or not, so every label in the row sits on one baseline.
          marginTop: 26,
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--dim)",
          transition: "color .3s",
        }}
      >
        {brand.inStock > 0 ? `${brand.inStock} in stock` : "Ask in store"}
      </span>
    </Link>
  );
}

function RailButton({ dir, enabled, onClick }: { dir: "prev" | "next"; enabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      aria-label={dir === "prev" ? "Previous brands" : "Next brands"}
      style={{
        width: 40,
        height: 40,
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: "transparent",
        color: enabled ? "var(--body)" : "var(--faint)",
        cursor: enabled ? "pointer" : "default",
        opacity: enabled ? 1 : 0.4,
        display: "grid",
        placeItems: "center",
        transition: "color .3s, border-color .3s, opacity .3s",
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d={dir === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function Fade({ side, show }: { side: "left" | "right"; show: boolean }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        [side]: 0,
        width: 90,
        pointerEvents: "none",
        opacity: show ? 1 : 0,
        transition: "opacity .35s",
        background: `linear-gradient(to ${side === "left" ? "right" : "left"}, var(--bg), transparent)`,
      }}
    />
  );
}
