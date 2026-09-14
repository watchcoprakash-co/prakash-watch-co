import type { Metadata } from "next";
import Link from "next/link";
import Cursor from "@/components/Cursor";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { liveOffers, KIND_LABELS, type Offer } from "@/lib/offers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Offers — Prakash Watch Co.",
  description:
    "Bank and card offers, festive schemes, exchange value and EMI at Prakash Watch Co. Authorised multi-brand watch boutiques across Delhi NCR since 1976.",
};

/** "31 October 2026" — the way it would be written on a counter card. */
function longDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function validity(offer: Offer): string {
  if (offer.startsAt && offer.endsAt) return `${longDate(offer.startsAt)} — ${longDate(offer.endsAt)}`;
  if (offer.endsAt) return `Until ${longDate(offer.endsAt)}`;
  if (offer.startsAt) return `From ${longDate(offer.startsAt)}`;
  return "While it lasts";
}

/** Days remaining, so a scheme about to close says so. */
function endingSoon(offer: Offer): number | null {
  if (!offer.endsAt) return null;
  const end = new Date(`${offer.endsAt}T23:59:59`).getTime();
  const days = Math.ceil((end - Date.now()) / 86_400_000);
  return days >= 0 && days <= 7 ? days : null;
}

export default async function OffersPage() {
  const offers = await liveOffers();

  return (
    <main style={{ position: "relative", minHeight: "100vh", background: "var(--bg)", overflow: "hidden" }}>
      <div className="grain" />
      <Cursor />
      <Nav />

      <section style={{ padding: "160px 44px 44px" }}>
        <span className="kicker">04 — Offers</span>
        <h1 className="h2" style={{ fontSize: "clamp(38px, 5.4vw, 86px)", maxWidth: 980 }}>
          What is on<br />
          <span className="italic-accent">just now</span>
        </h1>
        <p style={{ maxWidth: 560, margin: "24px 0 0", fontSize: 15.5, lineHeight: 1.75, fontWeight: 300, color: "var(--muted)" }}>
          Bank schemes, festive pricing, exchange value against your old piece, and instalments. Every one of these is
          honoured at the counter in all four boutiques — bring the card, or just bring the watch.
        </p>
      </section>

      <section style={{ padding: "0 44px 120px" }}>
        {offers.length === 0 ? (
          <div style={{ border: "1px solid var(--line)", background: "var(--card)", padding: "70px 40px", textAlign: "center" }}>
            <p className="serif" style={{ fontSize: 26, margin: 0 }}>Nothing running this week.</p>
            <p style={{ margin: "14px 0 0", fontSize: 14.5, fontWeight: 300, color: "var(--muted)" }}>
              Schemes come and go with the season and with the banks.{" "}
              <a href="tel:+919899645897" style={{ color: "var(--accent-soft)" }}>Call the shop</a> — there is often
              something we can do that has not been printed yet.
            </p>
          </div>
        ) : (
          <div className="offer-grid">
            {offers.map((offer) => {
              const soon = endingSoon(offer);
              return (
                <article key={offer.id} className="offer-card hover-card">
                  <div className="offer-top">
                    <span className="mono offer-kind">{KIND_LABELS[offer.kind]}</span>
                    {soon !== null && (
                      <span className="mono offer-soon">
                        {soon === 0 ? "Last day" : soon === 1 ? "1 day left" : `${soon} days left`}
                      </span>
                    )}
                  </div>

                  {offer.headline && <p className="offer-headline serif">{offer.headline}</p>}
                  <h2 className="offer-title serif">{offer.title}</h2>
                  {offer.blurb && <p className="offer-blurb">{offer.blurb}</p>}

                  {offer.brands.length > 0 && (
                    <p className="offer-brands mono">
                      {offer.brands.join(" · ")}
                    </p>
                  )}

                  <div className="offer-foot">
                    <span className="mono offer-validity">{validity(offer)}</span>
                    {offer.code && <span className="mono offer-code">{offer.code}</span>}
                  </div>

                  {offer.terms.length > 0 && (
                    <details className="offer-terms">
                      <summary className="mono">Terms</summary>
                      <ul>
                        {offer.terms.map((term) => (
                          <li key={term}>{term}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <p style={{ margin: "44px 0 0", maxWidth: 640, fontSize: 13.5, lineHeight: 1.75, fontWeight: 300, color: "var(--faint)" }}>
          Offers cannot usually be combined, and bank schemes are the bank&rsquo;s to honour or withdraw. Ask at the
          counter before billing and we will work out which one leaves you better off. Looking for something else —{" "}
          <Link href="/collections" style={{ color: "var(--accent-soft)" }}>see the collection</Link> or{" "}
          <Link href="/service" style={{ color: "var(--accent-soft)" }}>book a service</Link>.
        </p>
      </section>

      <Footer />
    </main>
  );
}
