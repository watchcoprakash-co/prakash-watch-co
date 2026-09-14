"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Search box that writes to the URL.
 *
 * Typing is debounced and replaces rather than pushes, so a search leaves one
 * history entry instead of one per keystroke, and the back button still returns
 * to wherever the shopper came from.
 */
export default function SearchBar({ initial }: { initial: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);
  const typed = useRef(false);

  // Keep in step when the URL changes elsewhere (a cleared filter, a back button).
  useEffect(() => {
    if (!typed.current) setValue(initial);
  }, [initial]);

  useEffect(() => {
    if (!typed.current) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      const query = next.toString();
      router.replace(query ? `/collections?${query}` : "/collections", { scroll: false });
    }, 280);
    return () => clearTimeout(timer);
  }, [value, params, router]);

  return (
    <div style={{ position: "relative", flex: "1 1 260px", minWidth: 220 }}>
      <input
        type="search"
        value={value}
        onChange={(event) => {
          typed.current = true;
          setValue(event.target.value);
        }}
        placeholder="Search brand, model or reference…"
        aria-label="Search the collection"
        style={{
          width: "100%",
          padding: "13px 16px 13px 40px",
          background: "var(--card)",
          border: "1px solid var(--border)",
          color: "var(--text)",
          fontFamily: "inherit",
          fontSize: 14,
          fontWeight: 300,
          outline: "none",
        }}
      />
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        width="15"
        height="15"
        style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
    </div>
  );
}
