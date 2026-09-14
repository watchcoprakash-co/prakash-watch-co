import type { Metadata } from "next";
import { PageHead, Stat } from "@/components/admin/ui";
import SourceBook from "@/components/admin/SourceBook";
import { getSourceBook, tallyPublishers } from "@/lib/sourcebook";
import { getCatalogIndex } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Source book — Stock room" };

export default async function SourcesPage() {
  const index = await getCatalogIndex();
  const listed = new Set(index.map((entry) => entry.sku));
  const records = await getSourceBook(listed);
  const publishers = tallyPublishers(records);

  const totalSources = records.reduce((sum, record) => sum + record.sources.length, 0);
  const official = records.filter((record) => record.sources.some((s) => s.kind === "official")).length;
  const delisted = records.filter((record) => !record.stillListed).length;

  return (
    <>
      <PageHead
        title="Source book"
        lead="Every reference the agent has researched, and the exact pages it read for each one — kept whether or not the listing still exists."
      />

      <section className="ops-cards" aria-label="What has been recorded">
        <Stat label="References recorded" value={String(records.length)} sub={`${totalSources} pages read in total`} />
        <Stat
          label="With a brand source"
          value={String(official)}
          sub={records.length ? `${Math.round((official / records.length) * 100)}% read the maker's own site` : "—"}
        />
        <Stat label="Publishers seen" value={String(publishers.length)} sub="Ranked by what they gave" />
        <Stat
          label="No longer listed"
          value={String(delisted)}
          sub={delisted > 0 ? "History kept anyway" : "Every record still has a listing"}
        />
      </section>

      <SourceBook records={records} publishers={publishers} />

      <p className="ops-foot-note">
        Written as the agent works, one line per watch per run, and never edited. A re-run adds to a reference&rsquo;s
        history rather than replacing it, so a page that answered last month is still on record even if it has since
        gone offline. When a customer questions a specification, this is where the answer is: which page said it, and
        on what date it was read.
      </p>
    </>
  );
}
