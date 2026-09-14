import Link from "next/link";
import PriceFilter from "./PriceFilter";
import type { CatalogEntry } from "@/agent/types";
import {
  FILTER_GROUPS,
  activeCount,
  buildHref,
  facetOptions,
  toggledHref,
  type FilterState,
} from "@/lib/filters";

/**
 * The filter rail.
 *
 * Every option is an ordinary link carrying the next URL, so filtering works
 * before any JavaScript loads and each combination is a real, shareable address.
 * Counts are computed per group against the other filters, so a number always
 * answers "how many if I also picked this", never "how many are already showing".
 */
export default function FilterSidebar({
  entries,
  state,
  bounds,
}: {
  entries: CatalogEntry[];
  state: FilterState;
  bounds: { low: number; high: number };
}) {
  const active = activeCount(state);

  return (
    <details className="shop-sidebar" data-collapsible="true" open>
      <summary
        className="mono shop-filter-toggle"
        style={{
          cursor: "pointer",
          listStyle: "none",
          padding: "13px 0",
          fontSize: 10,
          letterSpacing: "0.2em",
          color: "var(--muted)",
          textTransform: "uppercase",
          borderBottom: "1px solid var(--line)",
        }}
      >
        Filters{active ? ` (${active})` : ""}
      </summary>

      <div className="shop-facets">
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            paddingBottom: 14,
            borderBottom: "1px solid var(--line)",
          }}
        >
          <span className="kicker">Refine</span>
          {active > 0 && (
            <Link
              href="/collections"
              data-hover
              className="mono"
              style={{ fontSize: 9, letterSpacing: "0.14em", color: "var(--accent-soft)", textTransform: "uppercase" }}
            >
              Clear all
            </Link>
          )}
        </div>

        <Group label="Price">
          <PriceFilter min={state.min} max={state.max} bounds={bounds} />
        </Group>

        <Group label="Availability">
          <Toggle
            href={buildHref({ ...state, inStock: !state.inStock })}
            label="In stock only"
            selected={state.inStock}
          />
          <Toggle
            href={buildHref({ ...state, onSale: !state.onSale })}
            label="Reduced"
            selected={state.onSale}
          />
        </Group>

        {FILTER_GROUPS.map((group) => {
          const options = facetOptions(entries, state, group);
          // A dimension nothing in the catalogue fills is not worth a heading.
          if (options.length < 2 && !options.some((option) => option.selected)) return null;

          return (
            <Group key={group.key} label={group.label}>
              {options.map((option) => (
                <Link
                  key={option.value}
                  href={toggledHref(state, group.key, option.value)}
                  scroll={false}
                  data-hover
                  className="facet-option"
                  data-selected={option.selected}
                  data-zero={option.count === 0}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span className="facet-box" aria-hidden>
                      {option.selected && (
                        <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="#0b0a09" strokeWidth="2.4">
                          <path d="M2 6.5L4.8 9 10 3.5" />
                        </svg>
                      )}
                    </span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {option.label}
                    </span>
                  </span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>
                    {option.count}
                  </span>
                </Link>
              ))}
            </Group>
          );
        })}
      </div>
    </details>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: "18px 0", borderBottom: "1px solid var(--line2)" }}>
      <h3
        className="mono"
        style={{
          margin: "0 0 10px",
          fontSize: 9.5,
          letterSpacing: "0.2em",
          color: "var(--dim)",
          textTransform: "uppercase",
          fontWeight: 400,
        }}
      >
        {label}
      </h3>
      {children}
    </section>
  );
}

function Toggle({ href, label, selected }: { href: string; label: string; selected: boolean }) {
  return (
    <Link href={href} scroll={false} data-hover className="facet-option" data-selected={selected}>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="facet-box" aria-hidden>
          {selected && (
            <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="#0b0a09" strokeWidth="2.4">
              <path d="M2 6.5L4.8 9 10 3.5" />
            </svg>
          )}
        </span>
        {label}
      </span>
    </Link>
  );
}
