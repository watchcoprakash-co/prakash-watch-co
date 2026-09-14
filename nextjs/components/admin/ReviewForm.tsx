"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { COLLECTION_META, COLLECTIONS } from "@/agent/config";
import type { WatchProduct } from "@/agent/types";

/** Local formatter — keeps the node-only helpers in agent/util out of the browser bundle. */
function inr(amount: number): string {
  return `₹${new Intl.NumberFormat("en-IN").format(Math.round(amount))}`;
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  background: "var(--panel)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  fontFamily: "inherit",
  fontSize: 14,
  fontWeight: 300,
  outline: "none",
};


/**
 * The controlled vocabulary the sidebar filters on.
 *
 * Mirrors `lib/filters.ts` deliberately: an edit made here has to land on one of
 * the values a shopper can actually filter by, or the correction would fix the
 * spec sheet and quietly break the filter.
 */
const FACET_FIELD_LABELS: Record<string, string> = {
  movement: "Movement",
  caseMaterial: "Case material",
  strap: "Strap",
  waterResistance: "Water resistance",
  caseSize: "Case size",
};

const FACET_LABELS: Record<string, Record<string, string>> = {
  movement: {
    automatic: "Automatic", quartz: "Quartz", solar: "Solar",
    smart: "Smart / hybrid", "hand-wound": "Hand-wound", mechanical: "Mechanical",
  },
  caseMaterial: {
    steel: "Stainless steel", resin: "Resin", titanium: "Titanium",
    ceramic: "Ceramic", "gold-tone": "Gold tone", brass: "Brass",
  },
  strap: { bracelet: "Steel bracelet", leather: "Leather", resin: "Resin", fabric: "Fabric" },
  waterResistance: { "30": "30 m", "50": "50 m", "100": "100 m", "200": "200 m+" },
  caseSize: { "under-36": "Under 36 mm", "36-40": "36 – 40 mm", "40-44": "40 – 44 mm", "over-44": "Over 44 mm" },
};

export default function ReviewForm({ product }: { product: WatchProduct }) {
  const router = useRouter();

  const [title, setTitle] = useState(product.title);
  const [modelName, setModelName] = useState(product.modelName ?? "");
  const [collection, setCollection] = useState(product.collection ?? "");
  const [gender, setGender] = useState(product.gender ?? "");
  const [selling, setSelling] = useState(String(product.price.selling));
  const [mrp, setMrp] = useState(product.price.mrp ? String(product.price.mrp) : "");
  const [quantity, setQuantity] = useState(product.quantity === null ? "" : String(product.quantity));
  const [inStock, setInStock] = useState(product.inStock);
  const [tagline, setTagline] = useState(product.copy.tagline);
  const [short, setShort] = useState(product.copy.short);
  const [long, setLong] = useState(product.copy.long);
  const [images, setImages] = useState(product.images);

  // The specification sheet and the filterable values, both correctable by hand.
  const [specs, setSpecs] = useState(
    product.specs.map((spec) => ({ label: spec.label, value: spec.value, group: spec.group })),
  );
  const [facets, setFacets] = useState({
    movement: product.facets.movement ?? "",
    caseMaterial: product.facets.caseMaterial ?? "",
    strap: product.facets.strap ?? "",
    dialColour: product.facets.dialColour ?? "",
    waterResistance: product.facets.waterResistance ?? "",
    caseSize: product.facets.caseSize ?? "",
  });
  const [uploading, setUploading] = useState(false);

  const [busy, setBusy] = useState<null | "save" | "publish" | "unpublish" | "delete">(null);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);

  function patchBody(status?: "ready" | "needs_review") {
    const sellingValue = Number(selling);
    const mrpValue = mrp.trim() ? Number(mrp) : null;

    return {
      ...(status ? { status } : {}),
      title: title.trim(),
      modelName: modelName.trim() || null,
      collection: collection ? collection : null,
      gender: gender ? gender : null,
      inStock,
      quantity: quantity.trim() ? Number(quantity) : null,
      price: { selling: sellingValue, mrp: mrpValue },
      copy: { tagline, short, long },
      imageOrder: images.map((image) => image.url),
      specs: specs.filter((spec) => spec.label.trim() && spec.value.trim()),
      // The readable label goes to the spec sheet, the code to the filters, so the
      // two can never disagree about what this watch is.
      facets: Object.fromEntries(
        Object.entries(facets).map(([key, value]) => [key, value || null]),
      ) as Record<string, string | null>,
      attributes: {
        movement: FACET_LABELS.movement[facets.movement] ?? null,
        caseMaterial: FACET_LABELS.caseMaterial[facets.caseMaterial] ?? null,
        strapMaterial: FACET_LABELS.strap[facets.strap] ?? null,
        dialColour: facets.dialColour || null,
        waterResistance: FACET_LABELS.waterResistance[facets.waterResistance] ?? null,
      },
    };
  }

  /** Sends photographs the shop took itself, and adopts whatever comes back. */
  async function uploadPhotos(files: File[]) {
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      for (const file of files.slice(0, 8)) form.append("photos", file);

      const response = await fetch(`/api/admin/products/${product.sku}/photos`, { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) {
        setMessage({ text: payload.errors?.[0] ?? "Those could not be added.", bad: true });
        return;
      }
      setImages(payload.images);
      setMessage({
        text: payload.warnings?.length ? payload.warnings.join(" ") : "Photograph added.",
        bad: Boolean(payload.warnings?.length),
      });
    } catch {
      setMessage({ text: "Could not reach the server.", bad: true });
    } finally {
      setUploading(false);
    }
  }

  async function save(status?: "ready" | "needs_review", action: "save" | "publish" | "unpublish" = "save") {
    if (Number(selling) <= 0 || !Number.isFinite(Number(selling))) {
      setMessage({ text: "Enter a valid selling price.", bad: true });
      return;
    }

    setBusy(action);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/products/${product.sku}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patchBody(status)),
      });
      const body = (await response.json()) as { error?: string; details?: string[] };

      if (!response.ok) {
        setMessage({ text: body.details?.join(" ") ?? body.error ?? "Could not save.", bad: true });
      } else {
        setMessage({
          text: status === "ready" ? "Published to the shop." : status === "needs_review" ? "Taken off the shop." : "Saved.",
          bad: false,
        });
        router.refresh();
      }
    } catch {
      setMessage({ text: "The server did not respond.", bad: true });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${product.title} and its images? This cannot be undone.`)) return;

    setBusy("delete");
    try {
      const response = await fetch(`/api/admin/products/${product.sku}`, { method: "DELETE" });
      if (response.ok) router.push("/admin");
      else setMessage({ text: "Could not delete.", bad: true });
    } catch {
      setMessage({ text: "The server did not respond.", bad: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
      {/* Images */}
      <section>
        <span className="kicker">Photographs — first is the shop front image</span>
        {images.length === 0 ? (
          <p style={{ fontSize: 13.5, fontWeight: 300, color: "var(--muted)", marginTop: 14 }}>
            None kept. Add your own below — a photograph taken at the counter beats a wrong one found online.
          </p>
        ) : (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
            {images.map((image, index) => (
              <div key={image.url} style={{ width: 132 }}>
                <div
                  style={{
                    position: "relative",
                    width: 132,
                    height: 132,
                    background: "#100e0d",
                    border: `1px solid ${index === 0 ? "var(--accent)" : "var(--line)"}`,
                  }}
                >
                  <Image src={image.url} alt={image.alt} fill sizes="132px" style={{ objectFit: "contain", padding: 8 }} />
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  {index !== 0 && (
                    <MiniButton
                      onClick={() =>
                        setImages((previous) => [previous[index], ...previous.filter((_, i) => i !== index)])
                      }
                    >
                      Make first
                    </MiniButton>
                  )}
                  <MiniButton onClick={() => setImages((previous) => previous.filter((_, i) => i !== index))}>
                    Remove
                  </MiniButton>
                </div>
                <div className="mono" style={{ fontSize: 8.5, color: "var(--faint)", marginTop: 5, letterSpacing: "0.08em" }}>
                  {image.kind.toUpperCase()} · MATCH {(image.matchScore * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        )}

        <label className="svc-file" style={{ marginTop: 18 }}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            disabled={uploading || images.length >= 8}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = "";
              if (files.length) void uploadPhotos(files);
            }}
          />
          <span className="mono">
            {uploading ? "Uploading…" : images.length >= 8 ? "Eight is the limit" : "Add your own photograph"}
          </span>
        </label>
      </section>

      {/* Specification */}
      <section>
        <span className="kicker">Specification — corrected by hand</span>
        <p style={{ fontSize: 12.5, fontWeight: 300, color: "var(--faint)", margin: "10px 0 0", maxWidth: 640, lineHeight: 1.6 }}>
          These are the researched figures. Change any that are wrong; an edited line stops citing its source, because
          it is now the shop&rsquo;s word rather than the page&rsquo;s.
        </p>

        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {specs.map((spec, index) => (
            <div key={index} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={spec.label}
                placeholder="Movement"
                onChange={(event) =>
                  setSpecs((rows) => rows.map((r, i) => (i === index ? { ...r, label: event.target.value } : r)))
                }
                style={{ ...fieldStyle, flex: "0 0 190px", fontSize: 13 }}
              />
              <input
                value={spec.value}
                placeholder="Automatic, calibre 4R35"
                onChange={(event) =>
                  setSpecs((rows) => rows.map((r, i) => (i === index ? { ...r, value: event.target.value } : r)))
                }
                style={{ ...fieldStyle, flex: 1, fontSize: 13 }}
              />
              <MiniButton onClick={() => setSpecs((rows) => rows.filter((_, i) => i !== index))}>Remove</MiniButton>
            </div>
          ))}
          <div>
            <MiniButton onClick={() => setSpecs((rows) => [...rows, { label: "", value: "", group: "Specification" }])}>
              Add a line
            </MiniButton>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section>
        <span className="kicker">How it files — what the shop filters find</span>
        <p style={{ fontSize: 12.5, fontWeight: 300, color: "var(--faint)", margin: "10px 0 0", maxWidth: 640, lineHeight: 1.6 }}>
          Chosen from the same list the sidebar offers, so a correction here cannot produce a value nothing filters on.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16, marginTop: 16 }}>
          {(["movement", "caseMaterial", "strap", "waterResistance", "caseSize"] as const).map((key) => (
            <Field key={key} label={FACET_FIELD_LABELS[key]}>
              <select
                value={facets[key]}
                onChange={(event) => setFacets((f) => ({ ...f, [key]: event.target.value }))}
                style={fieldStyle}
              >
                <option value="">— not set —</option>
                {Object.entries(FACET_LABELS[key]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
          ))}
          <Field label="Dial colour">
            <input
              value={facets.dialColour}
              placeholder="blue"
              onChange={(event) => setFacets((f) => ({ ...f, dialColour: event.target.value.toLowerCase() }))}
              style={fieldStyle}
            />
          </Field>
        </div>
      </section>

      {/* Details */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 18 }}>
        <Field label="Display title">
          <input value={title} onChange={(event) => setTitle(event.target.value)} style={fieldStyle} />
        </Field>
        <Field label="Model name">
          <input value={modelName} onChange={(event) => setModelName(event.target.value)} style={fieldStyle} />
        </Field>
        <Field label="Collection">
          <select value={collection} onChange={(event) => setCollection(event.target.value)} style={fieldStyle}>
            <option value="">— unassigned —</option>
            {COLLECTIONS.map((id) => (
              <option key={id} value={id}>
                {COLLECTION_META[id].name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Worn by">
          <select value={gender} onChange={(event) => setGender(event.target.value)} style={fieldStyle}>
            <option value="">— unspecified —</option>
            <option value="men">Men</option>
            <option value="women">Women</option>
            <option value="unisex">Unisex</option>
          </select>
        </Field>
        <Field label={`Selling price — ${inr(Number(selling) || 0)}`}>
          <input type="number" value={selling} onChange={(event) => setSelling(event.target.value)} style={fieldStyle} />
        </Field>
        <Field label="MRP (optional)">
          <input type="number" value={mrp} onChange={(event) => setMrp(event.target.value)} style={fieldStyle} />
        </Field>
        <Field label="Quantity">
          <input type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} style={fieldStyle} />
        </Field>
        <Field label="Availability">
          <label
            className="mono"
            style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 10, letterSpacing: "0.14em", color: "var(--body)", textTransform: "uppercase", paddingTop: 11 }}
          >
            <input type="checkbox" checked={inStock} onChange={(event) => setInStock(event.target.checked)} style={{ accentColor: "#c98a5e", width: 14, height: 14 }} />
            In stock
          </label>
        </Field>
      </section>

      {/* Copy */}
      <section style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Field label="Tagline — shown on the collection card">
          <input value={tagline} onChange={(event) => setTagline(event.target.value)} style={fieldStyle} />
        </Field>
        <Field label="Short description">
          <textarea value={short} rows={2} onChange={(event) => setShort(event.target.value)} style={{ ...fieldStyle, resize: "vertical" }} />
        </Field>
        <Field label="Full description">
          <textarea value={long} rows={7} onChange={(event) => setLong(event.target.value)} style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.7 }} />
        </Field>
      </section>

      {message && (
        <p className="mono" style={{ margin: 0, fontSize: 11, letterSpacing: "0.08em", color: message.bad ? "#e0857a" : "var(--accent)" }}>
          {message.text}
        </p>
      )}

      <section style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: 22 }}>
        <button type="button" onClick={() => save()} disabled={busy !== null} data-hover className="btn btn-ghost" style={{ cursor: "pointer" }}>
          {busy === "save" ? "Saving…" : "Save changes"}
        </button>

        {product.status === "ready" ? (
          <button type="button" onClick={() => save("needs_review", "unpublish")} disabled={busy !== null} data-hover className="btn btn-ghost" style={{ cursor: "pointer" }}>
            {busy === "unpublish" ? "…" : "Take off the shop"}
          </button>
        ) : (
          <button type="button" onClick={() => save("ready", "publish")} disabled={busy !== null} data-hover className="btn btn-solid" style={{ border: "none", cursor: "pointer" }}>
            {busy === "publish" ? "…" : "Approve and publish"}
          </button>
        )}

        <button
          type="button"
          onClick={remove}
          disabled={busy !== null}
          data-hover
          className="mono"
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: "1px solid var(--line)",
            color: "var(--dim)",
            padding: "12px 16px",
            fontSize: 9.5,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          {busy === "delete" ? "…" : "Delete"}
        </button>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <span className="kicker">{label}</span>
      {children}
    </label>
  );
}

function MiniButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-hover
      className="mono"
      style={{
        flex: 1,
        background: "transparent",
        border: "1px solid var(--line)",
        color: "var(--dim)",
        padding: "5px 4px",
        fontSize: 8,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
