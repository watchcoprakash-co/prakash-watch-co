import Link from "next/link";
import { getAnalytics, type AnalyticsFilter } from "@/lib/analytics";
import { ChartFrame, Columns, Composition, RankedBars, Series } from "@/components/admin/charts";
import { PageHead, Stat, formatInr } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const PERIODS = [
  { days: 7, grain: "day" as const, label: "7 days" },
  { days: 30, grain: "day" as const, label: "30 days" },
  { days: 90, grain: "week" as const, label: "90 days" },
  { days: 365, grain: "month" as const, label: "12 months" },
];

type Params = { brand?: string; collection?: string; days?: string };

/** Builds the URL for one changed facet, preserving everything else. */
function href(current: Params, patch: Partial<Params>): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `/admin/analytics?${query}` : "/admin/analytics";
}

/** Adds or removes one value from a comma-separated parameter. */
function toggle(list: string, value: string): string {
  const items = list ? list.split(",").filter(Boolean) : [];
  return (items.includes(value) ? items.filter((i) => i !== value) : [...items, value]).join(",");
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const days = Number(params.days) || 30;
  const period = PERIODS.find((p) => p.days === days) ?? PERIODS[1];

  const filter: AnalyticsFilter = {
    brands: params.brand ? params.brand.split(",").filter(Boolean) : [],
    collections: params.collection ? params.collection.split(",").filter(Boolean) : [],
    days: period.days,
    grain: period.grain,
  };

  const data = await getAnalytics(filter);
  const { kpi } = data;
  const filtered = filter.brands.length > 0 || filter.collections.length > 0;

  return (
    <>
      <PageHead
        title="Analytics"
        lead={
          filtered
            ? `Showing ${data.matched} reference${data.matched === 1 ? "" : "s"} matching the filters below. Sales figures count only the lines for these watches, so a mixed invoice is split correctly.`
            : "The whole shop. Narrow by brand or type to see how one part of the range is doing."
        }
      />

      {/* Filters */}
      <section className="ops-panel" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
          <FilterRow label="Brand">
            {data.brandsAvailable.map((brand) => (
              <Chip key={brand} href={href(params, { brand: toggle(params.brand ?? "", brand) })}
                active={filter.brands.includes(brand)}>{brand}</Chip>
            ))}
          </FilterRow>

          <FilterRow label="Type">
            {data.collectionsAvailable.map((collection) => (
              <Chip key={collection} href={href(params, { collection: toggle(params.collection ?? "", collection) })}
                active={filter.collections.includes(collection)}>{collection.replace(/-/g, " ")}</Chip>
            ))}
          </FilterRow>

          <FilterRow label="Period">
            {PERIODS.map((option) => (
              <Chip key={option.days} href={href(params, { days: String(option.days) })} active={period.days === option.days}>
                {option.label}
              </Chip>
            ))}
          </FilterRow>

          {filtered && (
            <Link href={href({}, { days: params.days })} className="mono"
              style={{ marginLeft: "auto", alignSelf: "center", fontSize: 9.5, letterSpacing: ".14em", color: "var(--accent-soft)", textTransform: "uppercase" }}>
              Clear filters
            </Link>
          )}
        </div>
      </section>

      {/* Money */}
      <section className="ops-cards">
        <Stat label={`Revenue · ${period.label}`} value={formatInr(kpi.revenue)} tone="accent"
          sub={`${kpi.bills} bill${kpi.bills === 1 ? "" : "s"} · ${kpi.unitsSold} watch${kpi.unitsSold === 1 ? "" : "es"}`} />
        <Stat label="Average bill" value={kpi.averageBill ? formatInr(kpi.averageBill) : "—"}
          sub={kpi.discountGiven ? `${formatInr(kpi.discountGiven)} discount given` : "No discount given"} />
        <Stat label="Stock value" value={formatInr(kpi.stockValue)} sub={`${kpi.stockUnits} units held`} />
        <Stat label="Sell-through" value={`${(kpi.sellThrough * 100).toFixed(1)}%`}
          sub="Sold as a share of everything held plus sold" />
      </section>

      {/* Trend */}
      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(240px, 1fr)", gap: 20, marginTop: 20, alignItems: "start" }}>
        <ChartFrame title={`Revenue by ${period.grain}`} note={period.label}>
          <Series points={data.revenueSeries} unit="money" />
        </ChartFrame>
        <ChartFrame title="Watches sold" note={period.label}>
          <Series points={data.unitsSeries} unit="count" height={150} />
        </ChartFrame>
      </section>

      {/* Brand + composition */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginTop: 20 }}>
        <ChartFrame title="Stock value by brand" note="bar 1 held · bar 2 sold">
          <RankedBars rows={data.byBrand} unit="money" />
        </ChartFrame>
        <ChartFrame title="Range by type" note={`${data.matched} references`}>
          <Composition rows={data.byCollection} unit="count" />
        </ChartFrame>
        <ChartFrame title="Price ladder" note="references per band">
          <Columns rows={data.priceBands} unit="count" />
        </ChartFrame>
      </section>

      {/* The range itself */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, marginTop: 20 }}>
        <ChartFrame title="Movement"><Composition rows={data.movement} unit="count" /></ChartFrame>
        <ChartFrame title="Case size"><Columns rows={data.caseSize} unit="count" /></ChartFrame>
        <ChartFrame title="Water resistance"><Columns rows={data.waterResistance} unit="count" /></ChartFrame>
        <ChartFrame title="Worn by"><Composition rows={data.gender} unit="count" /></ChartFrame>
      </section>

      {/* Sales detail */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginTop: 20 }}>
        <ChartFrame title="Best sellers" note={period.label}>
          <RankedBars rows={data.topSellers} unit="money" />
        </ChartFrame>
        <ChartFrame title="How customers paid" note={period.label}>
          <Composition rows={data.paymentMix} unit="money" />
        </ChartFrame>
        <ChartFrame title="Sitting longest" note="unsold, oldest first">
          {data.slowest.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 300, color: "var(--dim)" }}>Everything in stock has sold at least once.</p>
          ) : (
            <table className="ops-table">
              <thead><tr><th>Watch</th><th style={{ textAlign: "right" }}>Listed</th><th style={{ textAlign: "right" }}>Value</th></tr></thead>
              <tbody>
                {data.slowest.map((row) => (
                  <tr key={row.sku}>
                    <td>
                      <Link href={`/admin/review/${row.sku}`} style={{ color: "var(--text)" }}>{row.title}</Link>
                      <span className="mono" style={{ display: "block", fontSize: 9, color: "var(--faint)", marginTop: 2 }}>{row.brand}</span>
                    </td>
                    <td className="ops-num">{row.days}d</td>
                    <td className="ops-num">{formatInr(row.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ChartFrame>
      </section>

      {kpi.potentialMargin > 0 && (
        <p style={{ marginTop: 20, fontSize: 12, fontWeight: 300, color: "var(--dim)", lineHeight: 1.7 }}>
          Held stock carries {formatInr(kpi.potentialMargin)} of headroom against MRP, on the references where the sheet
          quoted one. GST collected in this period: {formatInr(kpi.gstCollected)}.
        </p>
      )}
    </>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 9, letterSpacing: ".18em", color: "var(--faint)", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false} className="ops-chip" data-tone={active ? "good" : "mute"}
      style={{ borderColor: active ? "var(--accent)" : undefined, textTransform: "capitalize", cursor: "pointer" }}>
      {children}
    </Link>
  );
}
