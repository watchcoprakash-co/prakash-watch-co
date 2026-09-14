"use client";
import { useRouter, useSearchParams } from "next/navigation";

const OPTIONS: Array<{ value: string; label: string }> = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price — low to high" },
  { value: "price-desc", label: "Price — high to low" },
  { value: "discount", label: "Biggest saving" },
  { value: "name", label: "Name A–Z" },
];

export default function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <label className="mono" style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 9.5, letterSpacing: "0.16em", color: "var(--dim)", textTransform: "uppercase" }}>
      Sort
      <select
        value={value}
        onChange={(event) => {
          const next = new URLSearchParams(params.toString());
          if (event.target.value === "featured") next.delete("sort");
          else next.set("sort", event.target.value);
          const query = next.toString();
          router.replace(query ? `/collections?${query}` : "/collections", { scroll: false });
        }}
        style={{
          padding: "10px 12px",
          background: "var(--card)",
          border: "1px solid var(--border)",
          color: "var(--text)",
          fontFamily: "inherit",
          fontSize: 12.5,
          letterSpacing: "normal",
          textTransform: "none",
          outline: "none",
          cursor: "pointer",
        }}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
