"use client";
import Image from "next/image";
import { useMemo, useState } from "react";
import { STATUSES, STATUS_LABELS, SERVICE_LABELS, isClosed, type Status } from "@/lib/repairs.shared";
import { formatInr } from "@/agent/format";

/**
 * The workshop tracker.
 *
 * A list rather than a kanban: the counter's question is almost always "where is
 * Mr Mehra's watch", which a searchable list answers instantly and a board of
 * columns does not. Status is moved from the row itself, because the moment a
 * change needs two clicks and a modal, it stops being recorded at all.
 */
type Ticket = {
  id: string;
  ref: string;
  createdAt: string;
  updatedAt: string;
  status: Status;
  customer: { name: string; phone: string; email: string; address: string };
  watch: { brand: string; model: string; reference: string; boughtYear: string; boughtHere: boolean };
  kind: keyof typeof SERVICE_LABELS;
  issue: string;
  accessories: string;
  photos: { url: string; name: string; bytes: number }[];
  estimate: number | null;
  promisedFor: string;
  history: { at: string; status: Status; note: string; by: string }[];
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export default function TicketBoard({ initial }: { initial: Ticket[] }) {
  const [tickets, setTickets] = useState(initial);
  const [filter, setFilter] = useState<Status | "open" | "all">("open");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (filter === "open" && isClosed(ticket.status)) return false;
      if (filter !== "open" && filter !== "all" && ticket.status !== filter) return false;
      if (!needle) return true;
      return [ticket.ref, ticket.customer.name, ticket.customer.phone, ticket.watch.brand, ticket.watch.model, ticket.watch.reference]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [tickets, filter, query]);

  async function patch(id: string, body: Record<string, unknown>) {
    setSaving(id);
    setError("");
    try {
      const response = await fetch(`/api/admin/repairs/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.errors?.[0] ?? "That did not save.");
        return;
      }
      setTickets((all) => all.map((ticket) => (ticket.id === id ? payload : ticket)));
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(null);
    }
  }

  const counts = useMemo(() => {
    const map = { open: 0, all: tickets.length } as Record<string, number>;
    for (const status of STATUSES) map[status] = 0;
    for (const ticket of tickets) {
      map[ticket.status] += 1;
      if (!isClosed(ticket.status)) map.open += 1;
    }
    return map;
  }, [tickets]);

  return (
    <div>
      <div className="ops-toolbar">
        <input
          className="ops-field ops-search"
          placeholder="Docket, name, phone or reference…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search tickets"
        />
        <div className="ops-filters">
          <Chip on={filter === "open"} onClick={() => setFilter("open")} label="On the bench" n={counts.open} />
          {STATUSES.map((status) => (
            <Chip
              key={status}
              on={filter === status}
              onClick={() => setFilter(status)}
              label={STATUS_LABELS[status]}
              n={counts[status]}
            />
          ))}
          <Chip on={filter === "all"} onClick={() => setFilter("all")} label="All" n={counts.all} />
        </div>
      </div>

      {error && <p className="ops-error" role="alert">{error}</p>}

      {shown.length === 0 ? (
        <p className="ops-empty">Nothing here. {filter === "open" ? "The bench is clear." : "Try another filter."}</p>
      ) : (
        <div className="ops-tickets">
          {shown.map((ticket) => {
            const open = openId === ticket.id;
            const overdue = !isClosed(ticket.status) && ticket.promisedFor && ticket.promisedFor < today;
            return (
              <article key={ticket.id} className="ops-ticket" data-open={open}>
                <button
                  type="button"
                  className="ops-ticket-head"
                  onClick={() => setOpenId(open ? null : ticket.id)}
                  aria-expanded={open}
                >
                  <span className="mono ops-ticket-ref">{ticket.ref.split("/").pop()}</span>
                  <span className="ops-ticket-who">
                    <b>{ticket.customer.name}</b>
                    <span className="mono">{ticket.customer.phone}</span>
                  </span>
                  <span className="ops-ticket-what">
                    {ticket.watch.brand} {ticket.watch.model}
                    <span className="mono">{SERVICE_LABELS[ticket.kind]}</span>
                  </span>
                  <span className={`ops-pill ops-pill-${ticket.status}`}>{STATUS_LABELS[ticket.status]}</span>
                  <span className="mono ops-ticket-age">
                    {overdue ? <b className="ops-overdue">Overdue</b> : `${daysSince(ticket.createdAt)}d`}
                  </span>
                </button>

                {open && (
                  <div className="ops-ticket-body">
                    <div className="ops-ticket-cols">
                      <div>
                        <Label>What they said</Label>
                        <p className="ops-issue">{ticket.issue}</p>
                        {ticket.accessories && (
                          <>
                            <Label>Came with</Label>
                            <p className="ops-issue">{ticket.accessories}</p>
                          </>
                        )}
                        <Label>Watch</Label>
                        <dl className="ops-dl">
                          <dt>Make</dt><dd>{ticket.watch.brand || "—"}</dd>
                          <dt>Model</dt><dd>{ticket.watch.model || "—"}</dd>
                          <dt>Reference</dt><dd>{ticket.watch.reference || "—"}</dd>
                          <dt>Bought</dt>
                          <dd>
                            {ticket.watch.boughtYear || "—"}
                            {ticket.watch.boughtHere && <span className="ops-ours"> · ours</span>}
                          </dd>
                        </dl>
                        {ticket.customer.address && (
                          <>
                            <Label>Address</Label>
                            <p className="ops-issue">{ticket.customer.address}</p>
                          </>
                        )}
                        {ticket.customer.email && (
                          <>
                            <Label>Email</Label>
                            <p className="ops-issue">{ticket.customer.email}</p>
                          </>
                        )}
                      </div>

                      <div>
                        {ticket.photos.length > 0 && (
                          <>
                            <Label>Photographs</Label>
                            <div className="ops-shots">
                              {ticket.photos.map((photo) => (
                                <a key={photo.url} href={photo.url} target="_blank" rel="noreferrer" className="ops-shot">
                                  <Image src={photo.url} alt={photo.name} fill sizes="120px" style={{ objectFit: "cover" }} />
                                </a>
                              ))}
                            </div>
                          </>
                        )}

                        <Label>Move it on</Label>
                        <Mover
                          ticket={ticket}
                          busy={saving === ticket.id}
                          onSave={(body) => patch(ticket.id, body)}
                        />

                        <Label>History</Label>
                        <ol className="ops-history">
                          {[...ticket.history].reverse().map((event, i) => (
                            <li key={`${event.at}-${i}`}>
                              <span className="mono">{shortDate(event.at)}</span>
                              <span>
                                <b>{STATUS_LABELS[event.status]}</b>
                                {event.note && <> — {event.note}</>}
                                {event.by && <span className="ops-by"> · {event.by}</span>}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Mover({
  ticket,
  busy,
  onSave,
}: {
  ticket: Ticket;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [status, setStatus] = useState<Status>(ticket.status);
  const [estimate, setEstimate] = useState(ticket.estimate === null ? "" : String(ticket.estimate));
  const [promised, setPromised] = useState(ticket.promisedFor);
  const [note, setNote] = useState("");
  const [by, setBy] = useState("");

  const changed =
    status !== ticket.status ||
    promised !== ticket.promisedFor ||
    note.trim() !== "" ||
    (estimate === "" ? ticket.estimate !== null : Number(estimate) !== ticket.estimate);

  return (
    <div className="ops-mover">
      <div className="ops-mover-row">
        <label>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as Status)}>
            {STATUSES.map((value) => (
              <option key={value} value={value}>{STATUS_LABELS[value]}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Estimate ₹</span>
          <input
            inputMode="numeric"
            value={estimate}
            onChange={(event) => setEstimate(event.target.value.replace(/[^\d.]/g, ""))}
            placeholder={ticket.estimate === null ? "not quoted" : ""}
          />
        </label>
        <label>
          <span>Promised</span>
          <input type="date" value={promised} onChange={(event) => setPromised(event.target.value)} />
        </label>
      </div>
      <div className="ops-mover-row">
        <label style={{ flex: 3 }}>
          <span>Note</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Called, customer approved." />
        </label>
        <label style={{ flex: 1 }}>
          <span>By</span>
          <input value={by} onChange={(event) => setBy(event.target.value)} placeholder="Initials" />
        </label>
      </div>
      <div className="ops-mover-foot">
        <button
          type="button"
          className="ops-btn"
          disabled={busy || !changed}
          onClick={() =>
            onSave({
              status,
              estimate: estimate === "" ? null : Number(estimate),
              promisedFor: promised,
              note,
              by,
            })
          }
        >
          {busy ? "Saving…" : "Record"}
        </button>
        {ticket.estimate !== null && (
          <span className="mono ops-quoted">Quoted {formatInr(ticket.estimate)}</span>
        )}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="ops-sublabel">{children}</span>;
}

function Chip({ on, onClick, label, n }: { on: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button type="button" className="ops-filter" data-on={on} onClick={onClick}>
      {label}
      <span className="mono">{n}</span>
    </button>
  );
}
