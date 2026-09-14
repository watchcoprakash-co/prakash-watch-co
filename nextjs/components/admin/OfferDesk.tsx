"use client";
import { useState } from "react";
import { KIND_LABELS, OFFER_KINDS, type Offer, type OfferKind } from "@/lib/offers.shared";

/**
 * Offers, written and withdrawn by the shop.
 *
 * Each offer carries its own dates, so the page below shows a live/expired/
 * scheduled state rather than just "on" — the commonest mistake with a scheme
 * like this is leaving Diwali pricing up in January, and the surest fix is to
 * make the expiry visible while it is being written rather than after.
 */
type Draft = {
  title: string;
  headline: string;
  kind: OfferKind;
  blurb: string;
  terms: string;
  code: string;
  brands: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  order: number;
};

const EMPTY: Draft = {
  title: "",
  headline: "",
  kind: "bank",
  blurb: "",
  terms: "",
  code: "",
  brands: "",
  startsAt: "",
  endsAt: "",
  active: true,
  order: 100,
};

const toDraft = (offer: Offer): Draft => ({
  title: offer.title,
  headline: offer.headline,
  kind: offer.kind,
  blurb: offer.blurb,
  terms: offer.terms.join("\n"),
  code: offer.code,
  brands: offer.brands.join(", "),
  startsAt: offer.startsAt,
  endsAt: offer.endsAt,
  active: offer.active,
  order: offer.order,
});

const lines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);
const commas = (value: string) => value.split(",").map((part) => part.trim()).filter(Boolean);

/** How long it runs, phrased for whichever of the two dates were given. */
function window_(startsAt: string, endsAt: string): string {
  if (startsAt && endsAt) return `${startsAt} → ${endsAt}`;
  if (endsAt) return `until ${endsAt}`;
  if (startsAt) return `from ${startsAt}`;
  return "no end date";
}

/** Live, waiting to start, or finished — from the dates, not from a flag. */
function state(offer: Offer): { label: string; tone: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (!offer.active) return { label: "Off", tone: "mute" };
  if (offer.startsAt && offer.startsAt > today) return { label: `From ${offer.startsAt}`, tone: "warn" };
  if (offer.endsAt && offer.endsAt < today) return { label: "Expired", tone: "bad" };
  return { label: "Live", tone: "good" };
}

export default function OfferDesk({ initial }: { initial: Offer[] }) {
  const [offers, setOffers] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function startNew() {
    setEditing("new");
    setDraft(EMPTY);
    setErrors([]);
  }

  function startEdit(offer: Offer) {
    setEditing(offer.id);
    setDraft(toDraft(offer));
    setErrors([]);
  }

  async function save() {
    setBusy(true);
    setErrors([]);
    const body = {
      ...draft,
      terms: lines(draft.terms),
      brands: commas(draft.brands),
      order: Number(draft.order) || 100,
    };

    try {
      const isNew = editing === "new";
      const response = await fetch(isNew ? "/api/admin/offers" : `/api/admin/offers/${editing}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        setErrors(payload.errors ?? ["That did not save."]);
        return;
      }
      setOffers((all) => (isNew ? [...all, payload] : all.map((o) => (o.id === payload.id ? payload : o))));
      setEditing(null);
    } catch {
      setErrors(["Could not reach the server."]);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(offer: Offer) {
    const response = await fetch(`/api/admin/offers/${offer.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !offer.active }),
    });
    if (response.ok) {
      const updated = await response.json();
      setOffers((all) => all.map((o) => (o.id === updated.id ? updated : o)));
    }
  }

  async function remove(offer: Offer) {
    if (!confirm(`Delete “${offer.title}” for good? Switching it off hides it without losing the wording.`)) return;
    const response = await fetch(`/api/admin/offers/${offer.id}`, { method: "DELETE" });
    if (response.ok) setOffers((all) => all.filter((o) => o.id !== offer.id));
  }

  return (
    <div>
      <div className="ops-toolbar">
        <button type="button" className="ops-btn" data-variant="solid" onClick={startNew}>
          Write an offer
        </button>
        <span className="ops-quoted mono">
          {offers.filter((o) => state(o).label === "Live").length} live of {offers.length}
        </span>
      </div>

      {editing && (
        <div className="ops-panel" style={{ marginBottom: "var(--ops-4)" }}>
          <div className="ops-mover-row">
            <label style={{ flex: 3 }}>
              <span>Title</span>
              <input value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="HDFC Bank cards" />
            </label>
            <label style={{ flex: 2 }}>
              <span>Headline</span>
              <input value={draft.headline} onChange={(e) => set("headline", e.target.value)} placeholder="10% off" />
            </label>
            <label style={{ flex: 1 }}>
              <span>Kind</span>
              <select value={draft.kind} onChange={(e) => set("kind", e.target.value as OfferKind)}>
                {OFFER_KINDS.map((kind) => (
                  <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="ops-mover-row">
            <label style={{ flex: 1 }}>
              <span>Blurb</span>
              <input value={draft.blurb} onChange={(e) => set("blurb", e.target.value)} placeholder="One sentence a customer reads first." />
            </label>
          </div>

          <div className="ops-mover-row">
            <label>
              <span>Starts</span>
              <input type="date" value={draft.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
            </label>
            <label>
              <span>Ends</span>
              <input type="date" value={draft.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
            </label>
            <label>
              <span>Code</span>
              <input value={draft.code} onChange={(e) => set("code", e.target.value)} placeholder="Optional" />
            </label>
            <label>
              <span>Order</span>
              <input inputMode="numeric" value={draft.order} onChange={(e) => set("order", Number(e.target.value.replace(/\D/g, "")) || 0)} />
            </label>
          </div>

          <div className="ops-mover-row">
            <label style={{ flex: 1 }}>
              <span>Brands — comma separated, blank for all</span>
              <input value={draft.brands} onChange={(e) => set("brands", e.target.value)} placeholder="SEIKO, CASIO" />
            </label>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: "var(--ops-2)" }}>
            <span className="mono" style={{ fontSize: 8.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--faint)" }}>
              Terms — one per line
            </span>
            <textarea
              className="ops-field"
              rows={4}
              value={draft.terms}
              onChange={(e) => set("terms", e.target.value)}
              placeholder={"Maximum discount ₹10,000 per card.\nNot valid with any other offer."}
              style={{ resize: "vertical", lineHeight: 1.6 }}
            />
          </label>

          <label className="ops-switch">
            <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} />
            <span>Show on the website (subject to the dates above)</span>
          </label>

          {errors.length > 0 && (
            <div role="alert" style={{ margin: "var(--ops-2) 0 0" }}>
              {errors.map((error) => (
                <p key={error} className="ops-error" style={{ margin: "3px 0" }}>{error}</p>
              ))}
            </div>
          )}

          <div className="ops-mover-foot" style={{ marginTop: "var(--ops-3)" }}>
            <button type="button" className="ops-btn" data-variant="solid" disabled={busy} onClick={save}>
              {busy ? "Saving…" : editing === "new" ? "Publish" : "Save changes"}
            </button>
            <button type="button" className="ops-btn" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      {offers.length === 0 ? (
        <p className="ops-empty">Nothing written yet. Offers appear on the website&rsquo;s Offers page as soon as they are live.</p>
      ) : (
        <div className="ops-grid">
          {offers.map((offer) => {
            const s = state(offer);
            return (
              <div key={offer.id} className="ops-card ops-offer">
                <div className="ops-offer-head">
                  <span className="ops-chip" data-tone={s.tone}>{s.label}</span>
                  <span className="mono ops-offer-kind">{KIND_LABELS[offer.kind]}</span>
                </div>
                <div className="ops-offer-body">
                  {offer.headline && <span className="serif ops-offer-headline">{offer.headline}</span>}
                  <b>{offer.title}</b>
                  {offer.blurb && <p>{offer.blurb}</p>}
                  <span className="mono ops-offer-dates">
                    {window_(offer.startsAt, offer.endsAt)}
                    {offer.brands.length > 0 && ` · ${offer.brands.join(", ")}`}
                    {offer.code && ` · ${offer.code}`}
                  </span>
                </div>
                <div className="ops-offer-foot">
                  <button type="button" className="ops-btn" onClick={() => startEdit(offer)}>Edit</button>
                  <button type="button" className="ops-btn" onClick={() => toggle(offer)}>
                    {offer.active ? "Switch off" : "Switch on"}
                  </button>
                  <button type="button" className="ops-btn ops-danger" onClick={() => remove(offer)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
