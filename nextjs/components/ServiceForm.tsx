"use client";
import { useRef, useState } from "react";
import { SERVICE_KINDS, SERVICE_LABELS } from "@/lib/repairs.shared";

/**
 * The repair docket, as a customer fills it in.
 *
 * Posted as multipart because of the photographs, and left as a real <form> so it
 * still submits with JavaScript disabled and so the browser's own validation and
 * autofill do their jobs. Every field the workshop genuinely needs is required;
 * everything it merely likes to have is not, because a form that demands an
 * address before it will take a battery request just loses the battery request.
 */
type Result = { ref: string; photos: number; warnings: string[] };

const MAX_PHOTOS = 4;

export default function ServiceForm() {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<Result | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const form = useRef<HTMLFormElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrors([]);

    try {
      const response = await fetch("/api/service", { method: "POST", body: new FormData(event.currentTarget) });
      const payload = await response.json();
      if (!response.ok) {
        setErrors(payload.errors ?? ["Something went wrong. Please call the shop."]);
      } else {
        setDone(payload as Result);
        form.current?.reset();
        setPicked([]);
      }
    } catch {
      setErrors(["We could not reach the shop just now. Please try again, or call +91 98996 45897."]);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={{ border: "1px solid var(--border)", background: "var(--card)", padding: "52px 44px" }}>
        <span className="kicker" style={{ color: "var(--accent)" }}>Booked in</span>
        <h2 className="serif" style={{ margin: "18px 0 0", fontSize: "clamp(30px, 4vw, 46px)", lineHeight: 1.1 }}>
          Your docket is <span className="italic-accent">{done.ref}</span>
        </h2>
        <p style={{ margin: "20px 0 0", maxWidth: 520, fontSize: 15, lineHeight: 1.75, fontWeight: 300, color: "var(--muted)" }}>
          Keep that number — it is how the workshop finds your watch. Someone will call within one working day to
          confirm what the piece needs and what it will cost. Nothing is started, and nothing is charged, until you
          have agreed the estimate.
        </p>

        {done.warnings.length > 0 && (
          <ul style={{ margin: "22px 0 0", paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7, color: "var(--dim)" }}>
            {done.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}

        <button type="button" className="btn btn-ghost" style={{ marginTop: 34 }} onClick={() => setDone(null)}>
          Book another watch in
        </button>
      </div>
    );
  }

  return (
    <form ref={form} onSubmit={submit} className="svc-form" noValidate={false}>
      <fieldset disabled={busy} style={{ border: 0, margin: 0, padding: 0 }}>
        <Legend no="01" title="Who we are calling" />
        <div className="svc-grid">
          <Field label="Your name" name="name" required autoComplete="name" />
          <Field label="Phone" name="phone" required type="tel" autoComplete="tel" placeholder="+91" />
          <Field label="Email" name="email" type="email" autoComplete="email" hint="Optional" />
          <Field label="Address" name="address" hint="Optional — only if you want it collected" autoComplete="street-address" />
        </div>

        <Legend no="02" title="The watch" />
        <div className="svc-grid">
          <Field label="Make" name="brand" required placeholder="Seiko, Casio, Titan…" />
          <Field label="Model" name="model" hint="If you know it" />
          <Field label="Reference number" name="reference" hint="Usually on the caseback" />
          <Field label="Bought in" name="reference-year" inputName="boughtYear" inputMode="numeric" placeholder="2019" hint="Year, if you remember" />
        </div>

        <label className="svc-check">
          <input type="checkbox" name="boughtHere" />
          <span>I bought this watch from Prakash Watch Co.</span>
        </label>

        <Legend no="03" title="What it needs" />
        <div className="svc-field">
          <span className="svc-label">What is wrong <em>*</em></span>
          <div className="svc-kinds">
            {SERVICE_KINDS.map((kind, i) => (
              <label key={kind} className="svc-kind">
                <input type="radio" name="kind" value={kind} required defaultChecked={i === 0} />
                <span>{SERVICE_LABELS[kind]}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="svc-field">
          <label className="svc-label" htmlFor="issue">
            Tell us what it is doing <em>*</em>
          </label>
          <textarea
            id="issue"
            name="issue"
            required
            minLength={10}
            maxLength={2000}
            rows={5}
            className="svc-input"
            placeholder="Running fast by about two minutes a day, and the crown feels gritty when winding."
          />
        </div>

        <Field label="What is coming with it" name="accessories" hint="Box, papers, spare links — so we can check it all back" />

        <Legend no="04" title="Photographs" />
        <p className="svc-note">
          Optional, and useful. A photograph of the dial and one of the caseback usually tells the workshop more than
          a paragraph does. Up to {MAX_PHOTOS}, 6&nbsp;MB each.
        </p>

        <label className="svc-file">
          <input
            type="file"
            name="photos"
            accept="image/jpeg,image/png,image/webp,image/heic"
            multiple
            onChange={(event) => {
              const files = [...(event.target.files ?? [])].slice(0, MAX_PHOTOS);
              setPicked(files.map((file) => file.name));
            }}
          />
          <span className="mono">{picked.length ? `${picked.length} selected` : "Attach photographs"}</span>
        </label>
        {picked.length > 0 && (
          <ul className="svc-picked">
            {picked.map((name) => (
              <li key={name} className="mono">{name}</li>
            ))}
          </ul>
        )}

        {errors.length > 0 && (
          <div role="alert" className="svc-errors">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        )}

        <div className="svc-submit">
          <button type="submit" className="btn btn-solid" disabled={busy}>
            {busy ? "Sending…" : "Book the watch in"}
          </button>
          <p className="svc-note" style={{ margin: 0 }}>
            No payment now. We call with an estimate first, and nothing is opened until you say yes.
          </p>
        </div>
      </fieldset>
    </form>
  );
}

function Legend({ no, title }: { no: string; title: string }) {
  return (
    <div className="svc-legend">
      <span className="mono">{no}</span>
      <span className="serif">{title}</span>
    </div>
  );
}

function Field({
  label,
  name,
  inputName,
  hint,
  required,
  ...rest
}: {
  label: string;
  name: string;
  inputName?: string;
  hint?: string;
  required?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="svc-field">
      <label className="svc-label" htmlFor={name}>
        {label} {required ? <em>*</em> : hint ? <span className="svc-hint">{hint}</span> : null}
      </label>
      <input id={name} name={inputName ?? name} required={required} className="svc-input" {...rest} />
    </div>
  );
}
