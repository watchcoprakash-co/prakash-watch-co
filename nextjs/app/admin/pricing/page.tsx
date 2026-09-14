import type { Metadata } from "next";
import { PageHead, Stat } from "@/components/admin/ui";
import PriceDesk from "@/components/admin/PriceDesk";
import RefreshPanel from "@/components/admin/RefreshPanel";
import { getAllProducts } from "@/lib/catalog";
import { getPriceWatch } from "@/lib/pricing";
import { formatUsd } from "@/agent/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Price watch — Stock room" };

export default async function PricingPage() {
  const [report, products] = await Promise.all([getPriceWatch(), getAllProducts()]);
  // What the refresh will actually walk: on the shop, and with a page to go back to.
  const refreshable = products.filter((p) => p.status === "ready" && p.sources.length > 0).length;

  return (
    <>
      <PageHead
        title="Price watch"
        lead="Reads the brand and trade pages for every listed watch and reports what the list price is doing. It proposes; nothing changes until you say so."
      />

      <div style={{ margin: "var(--ops-4) 0" }}>
        <RefreshPanel total={refreshable} />
      </div>

      {report && (
        <section className="ops-cards" aria-label="Last sweep">
          <Stat label="Checked" value={String(report.checked)} sub={`${report.withData} priced somewhere`} />
          <Stat
            label="Needs a decision"
            value={String(report.proposals)}
            sub={report.proposals > 0 ? "List price has moved" : "Nothing outstanding"}
            tone={report.proposals > 0 ? "warn" : undefined}
          />
          <Stat label="Cost of the sweep" value={formatUsd(report.costUsd)} sub="Charged to the shop's key" />
          <Stat
            label="Last run"
            value={new Date(report.finishedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
            sub={new Date(report.finishedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          />
        </section>
      )}

      <PriceDesk initial={report} />

      <p className="ops-foot-note">
        <strong>The MRP is the brand&rsquo;s number and the selling price is yours.</strong> When a maker revises its
        list price the struck-through figure on the card stops being true, which is a correction worth making — so that
        is the one thing this can set. What the shop charges carries margin, ageing stock and what the customer in
        front of you will pay; no sweep of the internet gets a say in it. Where others are cheaper you are told, and
        the decision stays at the counter.
      </p>
    </>
  );
}
