import Link from "next/link";
import { getOverview } from "@/lib/analytics";
import { Bar, Empty, Icons, PageHead, Stat, TrendChart, formatInr } from "@/components/admin/ui";
import { formatUsd } from "@/agent/format";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const data = await getOverview();
  const { revenue, stock, catalogue, agent } = data;

  // Stated as a change only when there is a previous month to compare against;
  // "up 100%" from nothing is noise dressed as insight.
  const monthDelta =
    data.revenuePrevMonth > 0
      ? { pct: ((revenue.month - data.revenuePrevMonth) / data.revenuePrevMonth) * 100, label: "on last month" }
      : null;

  const needsAttention =
    catalogue.awaitingReview + stock.outOfStock + (catalogue.withoutPhoto || 0) > 0;

  return (
    <>
      <PageHead
        title="Overview"
        lead="Everything the shop is doing today: what has sold, what is on the shelf, and what the agent has been listing."
        action={
          <Link href="/admin/billing/new" className="ops-btn" data-variant="solid">
            {Icons.plus} New bill
          </Link>
        }
      />

      <section className="ops-cards" aria-label="Headline figures">
        <Stat label="Revenue this month" value={formatInr(revenue.month)} tone="accent"
          sub={`${data.billCount.month} bill${data.billCount.month === 1 ? "" : "s"} · ${data.unitsSold.month} watch${data.unitsSold.month === 1 ? "" : "es"}`}
          delta={monthDelta} />
        <Stat label="Today" value={formatInr(revenue.today)} sub={`This week ${formatInr(revenue.week)}`} />
        <Stat label="Stock at retail" value={formatInr(stock.retailValue)} sub={`${stock.units} units across ${stock.skus} references`} />
        <Stat label="Average bill" value={data.averageBill ? formatInr(data.averageBill) : "—"}
          sub={data.billCount.allTime ? `${data.billCount.allTime} bills all time` : "No sales recorded yet"} />
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(260px, 1fr)", gap: 20, marginTop: 20, alignItems: "start" }}>
        <div className="ops-panel">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 className="mono" style={{ margin: 0, fontSize: 9.5, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 400 }}>
              Revenue, last 30 days
            </h2>
            <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{formatInr(revenue.allTime)} all time</span>
          </div>
          {data.billCount.allTime === 0 ? (
            <Empty
              title="No sales yet"
              body="Write the first bill and this fills in — revenue, best sellers and stock all move from the same entry."
              href="/admin/billing/new"
              cta="Write a bill"
            />
          ) : (
            <TrendChart points={data.revenueSeries} />
          )}
        </div>

        <div className="ops-panel">
          <h2 className="mono" style={{ margin: "0 0 16px", fontSize: 9.5, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 400 }}>
            Needs attention
          </h2>
          {!needsAttention ? (
            <p style={{ fontSize: 13, fontWeight: 300, color: "var(--muted)", margin: 0 }}>
              Nothing waiting. Every listing is published and in stock.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {catalogue.awaitingReview > 0 && (
                <Attention href="/admin/catalogue?status=review" count={catalogue.awaitingReview}
                  label="listings awaiting review" hint="Approve or correct before they reach the shop." />
              )}
              {catalogue.provisional > 0 && (
                <Attention href="/admin/catalogue?flag=provisional-image" count={catalogue.provisional}
                  label="unconfirmed photographs" hint="The closest picture found — check it is the right colourway." />
              )}
              {stock.outOfStock > 0 && (
                <Attention href="/admin/inventory?filter=out" count={stock.outOfStock}
                  label="references out of stock" hint="Still listed, showing as sold out." />
              )}
              {stock.lowStock > 0 && (
                <Attention href="/admin/inventory?filter=low" count={stock.lowStock}
                  label="down to the last piece" hint="Worth reordering before the shelf is bare." />
              )}
            </ul>
          )}
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, marginTop: 20 }}>
        <div className="ops-panel">
          <h2 className="mono" style={{ margin: "0 0 16px", fontSize: 9.5, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 400 }}>
            Best sellers
          </h2>
          {data.topSellers.length === 0 ? (
            <p style={{ fontSize: 13, fontWeight: 300, color: "var(--dim)", margin: 0 }}>Nothing sold yet.</p>
          ) : (
            data.topSellers.map((seller) => (
              <Bar key={seller.sku} label={seller.title} value={seller.revenue}
                total={data.topSellers[0].revenue}
                hint={`${seller.units} sold · ${formatInr(seller.revenue)}`} />
            ))
          )}
        </div>

        <div className="ops-panel">
          <h2 className="mono" style={{ margin: "0 0 16px", fontSize: 9.5, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 400 }}>
            Stock by brand
          </h2>
          {data.brandMix.map((brand) => (
            <Bar key={brand.brand} label={brand.brand} value={brand.value}
              total={Math.max(...data.brandMix.map((b) => b.value), 1)}
              hint={`${brand.units} in stock${brand.sold ? ` · ${brand.sold} sold` : ""}`} />
          ))}
        </div>

        <div className="ops-panel">
          <h2 className="mono" style={{ margin: "0 0 16px", fontSize: 9.5, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 400 }}>
            Catalogue health
          </h2>
          <Bar label="Published to the shop" value={catalogue.published} total={catalogue.total}
            hint={`${catalogue.published} of ${catalogue.total}`} />
          <Bar label="With a photograph" value={catalogue.photoCoverage * 100} total={100}
            hint={`${Math.round(catalogue.photoCoverage * 100)}%`} />
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line2)", fontSize: 12, fontWeight: 300, color: "var(--dim)", lineHeight: 1.7 }}>
            {catalogue.specDepth.toFixed(1)} specifications per listing on average.<br />
            Agent has run {agent.runs} time{agent.runs === 1 ? "" : "s"}, spending {formatUsd(agent.spendUsd)}.
          </div>
        </div>
      </section>

      {data.recentBills.length > 0 && (
        <section className="ops-panel" style={{ marginTop: 20, padding: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "16px 20px" }}>
            <h2 className="mono" style={{ margin: 0, fontSize: 9.5, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 400 }}>
              Recent bills
            </h2>
            <Link href="/admin/billing" className="mono" style={{ fontSize: 9.5, letterSpacing: ".14em", color: "var(--accent-soft)", textTransform: "uppercase" }}>
              All bills
            </Link>
          </div>
          <table className="ops-table">
            <thead>
              <tr><th>Number</th><th>Customer</th><th>Items</th><th style={{ textAlign: "right" }}>Total</th><th>When</th></tr>
            </thead>
            <tbody>
              {data.recentBills.map((bill) => (
                <tr key={bill.id}>
                  <td><Link href={`/admin/billing/${bill.id}`} className="mono" style={{ fontSize: 11 }}>{bill.number}</Link></td>
                  <td>{bill.customer.name}</td>
                  <td className="mono" style={{ fontSize: 11, color: "var(--dim)" }}>
                    {bill.lines.reduce((n, l) => n + l.quantity, 0)}
                  </td>
                  <td className="ops-num" style={{ color: "var(--text)" }}>{formatInr(bill.total)}</td>
                  <td className="mono" style={{ fontSize: 10.5, color: "var(--dim)" }}>
                    {new Date(bill.issuedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function Attention({ href, count, label, hint }: { href: string; count: number; label: string; hint: string }) {
  return (
    <li>
      <Link href={href} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ color: "#d8b98a", marginTop: 1 }}>{Icons.alert}</span>
        <span>
          <span style={{ fontSize: 13, color: "var(--text)" }}>
            <span className="mono">{count}</span> {label}
          </span>
          <span style={{ display: "block", fontSize: 11.5, fontWeight: 300, color: "var(--dim)", marginTop: 2 }}>{hint}</span>
        </span>
      </Link>
    </li>
  );
}
