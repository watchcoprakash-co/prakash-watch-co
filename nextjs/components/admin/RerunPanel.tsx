"use client";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Researching listings again.
 *
 * Two shapes of the same action: one watch whose photographs came out wrong, and
 * the whole review queue after a fix to the agent. The progress log is the same
 * one an ingest shows, because a re-run is an ingest — the shop should not have
 * to learn a second vocabulary for it.
 */
type Props =
  | { mode: "one"; sku: string; label: string; canSetReference?: boolean; currentReference?: string }
  | { mode: "bulk"; count: number; scope: "review" | "flagged" };

export default function RerunPanel(props: Props) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [reference, setReference] = useState(
    props.mode === "one" ? props.currentReference ?? "" : "",
  );
  const [summary, setSummary] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const say = useCallback((line: string) => {
    setLines((all) => [...all.slice(-400), line]);
    requestAnimationFrame(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    });
  }, []);

  async function start() {
    if (running) return;
    setRunning(true);
    setLines([]);
    setError("");
    setSummary(null);

    const body =
      props.mode === "one"
        ? { skus: [props.sku], reference: reference.trim() || undefined }
        : { scope: props.scope };

    try {
      const response = await fetch("/api/admin/rerun", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({ errors: ["That could not be started."] }));
        setError(payload.errors?.[0] ?? "That could not be started.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const raw = chunk.replace(/^data: /, "").trim();
          if (!raw) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(raw);
          } catch {
            continue;
          }

          const type = event.type;
          if (type === "row:start") say(String(event.label));
          if (type === "row:stage") say(`   ${event.stage} — ${event.detail}`);
          if (type === "row:warn") say(`   ! ${event.message}`);
          if (type === "row:done") say(`   → ${event.status}, ${event.images} image(s)`);
          if (type === "row:fail") say(`   ✗ ${event.message}`);
          if (type === "error") setError(String(event.message));
          if (type === "run:done") {
            setSummary(
              `${event.ready} ready · ${event.needsReview} still need review · ${event.failed} failed`,
            );
          }
        }
      }
    } catch {
      setError("Connection lost during the re-run.");
    } finally {
      setRunning(false);
      // The listing on screen is now stale.
      router.refresh();
    }
  }

  const label =
    props.mode === "one"
      ? running
        ? "Researching…"
        : "Research this again"
      : running
        ? "Researching…"
        : `Re-run all ${props.count} under review`;

  return (
    <div>
      {props.mode === "one" && props.canSetReference && (
        <label className="ops-ref-field">
          <span>
            Manufacturer&rsquo;s reference — if you can read it off the caseback
          </span>
          <input
            value={reference}
            disabled={running}
            placeholder="e.g. LTP-V300L-1AUDF"
            onChange={(event) => setReference(event.target.value)}
          />
          <em>
            The sheet lists this watch under the shop&rsquo;s own code, which is too short to identify it
            anywhere. Give the real reference and the re-run will find it.
          </em>
        </label>
      )}

      <div className="ops-mover-foot">
        <button
          type="button"
          className="ops-btn"
          data-variant={props.mode === "bulk" ? "solid" : undefined}
          disabled={running || (props.mode === "bulk" && props.count === 0)}
          onClick={start}
        >
          {label}
        </button>
        {summary && <span className="ops-quoted mono">{summary}</span>}
      </div>

      {error && (
        <p className="ops-error" role="alert">
          {error}
        </p>
      )}

      {(running || lines.length > 0) && (
        <div ref={logRef} className="ops-log" style={{ marginTop: "var(--ops-3)" }}>
          {lines.map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
