/**
 * Progress events emitted by the Python ingestion agent.
 *
 * These mirror the payloads in `agent-py/prakash_agent/events.py`. The agent
 * streams them as server-sent events; the admin upload panel renders them live.
 */
import type { RunReport } from "./types";

export type AgentEvent =
  | { type: "run:start"; runId: string; file: string; rows: number; dryRun: boolean }
  | { type: "run:models"; model: string; visionModel: string; searchModel: string }
  | {
      type: "sheet:parsed";
      rows: number;
      rejected: number;
      headerMap: Record<string, string>;
      unmapped: string[];
      sheets: string[];
      skippedSheets: Array<{ sheet: string; reason: string }>;
    }
  /** Which half of an uploaded sheet this run is the shop's business. */
  | { type: "sheet:partitioned"; mode: "update" | "add"; kept: number; setAside: number }
  /** A whole-run step that is not about one watch — reading catalogues, say. */
  | { type: "run:stage"; stage: string }
  /** How much of the sheet a published catalogue can answer outright. */
  | { type: "sheet:planned"; covered: number; uncovered: number; catalogued: number }
  | { type: "row:start"; rowNumber: number; sku: string; label: string }
  | { type: "row:stage"; rowNumber: number; sku: string; stage: string; detail: string }
  | { type: "row:warn"; rowNumber: number; sku: string; message: string }
  | {
      type: "row:done";
      rowNumber: number;
      sku: string;
      status: string;
      images: number;
      costUsd: number;
      elapsedMs: number;
    }
  | { type: "row:fail"; rowNumber: number; sku: string; message: string }
  | { type: "budget:exceeded"; spentUsd: number; limitUsd: number }
  | {
      type: "run:done";
      runId: string;
      ready: number;
      needsReview: number;
      failed: number;
      skipped: number;
      costUsd: number;
    }
  /** Terminal messages added by the transport rather than the graph. */
  | { type: "report"; report: RunReport }
  | { type: "error"; message: string };
