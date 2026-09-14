import type { Metadata } from "next";
import { PageHead } from "@/components/admin/ui";
import OfferDesk from "@/components/admin/OfferDesk";
import { listOffers, isLive } from "@/lib/offers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Offers — Stock room" };

export default async function OffersAdminPage() {
  const offers = await listOffers();
  const live = offers.filter((offer) => isLive(offer)).length;

  return (
    <>
      <PageHead
        title="Offers"
        lead={
          live > 0
            ? `${live} showing on the website right now. Anything written here appears on the Offers page the moment its start date arrives, and disappears on its own the day after it ends.`
            : "Nothing is showing on the website. Write a scheme here and it goes live on its start date — and comes down by itself when it ends."
        }
      />

      <OfferDesk initial={offers} />

      <p className="ops-foot-note">
        Dates do the work: an offer with no end date runs until it is switched off, and one that has expired stays in
        this list — greyed out — so next Diwali can be written by editing last Diwali rather than from scratch.
        Switching an offer off hides it without losing the wording; deleting is permanent.
      </p>
    </>
  );
}
