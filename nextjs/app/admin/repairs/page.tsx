import type { Metadata } from "next";
import { PageHead, Stat } from "@/components/admin/ui";
import TicketBoard from "@/components/admin/TicketBoard";
import { listTickets, getCounts, STATUS_LABELS } from "@/lib/repairs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Repairs — Stock room" };

export default async function RepairsPage() {
  const [tickets, counts] = await Promise.all([listTickets(), getCounts()]);

  return (
    <>
      <PageHead
        title="Repairs"
        lead="Everything on the bench, and everything that has been through it. Requests raised on the website land here the moment they are sent."
      />

      <section className="ops-cards" aria-label="Workshop at a glance">
        <Stat label="On the bench" value={String(counts.open)} sub={`${counts.total} all time`} />
        <Stat label="Awaiting approval" value={String(counts.awaitingApproval)} sub="Quoted, not yet agreed" />
        <Stat
          label="Ready to collect"
          value={String(counts.byStatus.ready)}
          sub={counts.byStatus.ready > 0 ? "Worth a call" : "Nothing waiting"}
        />
        <Stat
          label="Past the promised date"
          value={String(counts.overdue)}
          sub={counts.overdue > 0 ? "Call before they do" : "All on time"}
          tone={counts.overdue > 0 ? "warn" : undefined}
        />
      </section>

      {counts.total === 0 ? (
        <p className="ops-empty">
          No tickets yet. They arrive from the <strong>Service &amp; repair</strong> page on the website, or you can
          take details at the counter and fill the same form.
        </p>
      ) : (
        <TicketBoard initial={tickets} />
      )}

      <p className="ops-foot-note">
        Status changes and notes are appended to each ticket&rsquo;s history with the date — nothing is overwritten,
        so &ldquo;you said it would be ready last Tuesday&rdquo; always has an answer. Statuses run{" "}
        {Object.values(STATUS_LABELS).slice(0, 7).join(" → ")}.
      </p>
    </>
  );
}
