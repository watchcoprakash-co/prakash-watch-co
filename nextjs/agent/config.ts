/**
 * Central configuration for the catalog ingestion agent.
 *
 * Every tunable lives here. Nothing else in the agent reads process.env directly,
 * so the admin panel can later construct a config object in-memory instead.
 */

export const COLLECTIONS = [
  "swiss-automatic",
  "dress-quartz",
  "dive-sport",
  "chronograph",
  "solar-eco",
  "connected",
] as const;

export type CollectionId = (typeof COLLECTIONS)[number];

/** Display metadata for the six families the storefront already renders. */
export const COLLECTION_META: Record<CollectionId, { no: string; name: string; note: string }> = {
  "swiss-automatic": { no: "001", name: "Swiss Automatic", note: "Mechanical, exhibition caseback" },
  "dress-quartz": { no: "002", name: "Dress Quartz", note: "Slim, leather, under 8mm" },
  "dive-sport": { no: "003", name: "Dive & Sport", note: "300m, rotating bezel" },
  chronograph: { no: "004", name: "Chronograph", note: "Tachymeter, sub-dials" },
  "solar-eco": { no: "005", name: "Solar & Eco", note: "Light powered, no battery" },
  connected: { no: "006", name: "Connected", note: "Hybrid smart, steel case" },
};

export interface AgentConfig {
  /** OpenRouter credentials + routing. */
  apiKey: string;
  /** Model used for grounded fact extraction and copywriting. */
  model: string;
  /** Cheap multimodal model used to grade downloaded images. */
  visionModel: string;
  /** Model used to drive the web-search plugin (kept cheap; it only relays citations). */
  searchModel: string;
  /** Sent as HTTP-Referer / X-Title for OpenRouter attribution. */
  appUrl: string;
  appTitle: string;

  /** How many sheet rows are processed at once. */
  concurrency: number;
  /** Max product pages scraped per watch. */
  maxSources: number;
  /**
   * OpenRouter web-search backend. 'parallel'+'turbo' measured ~$0.0014/search
   * versus ~$0.0118 for the default and ~$0.0073 for 'exa'. Exa surfaces official
   * brand pages slightly more often, so it is worth the cost on small sheets.
   */
  searchEngine: "parallel" | "exa" | "native";
  searchMode: "turbo" | "fast" | "basic" | "advanced";
  /** Max images kept per watch after grading. */
  maxImages: number;
  /** Minimum pixel width for an image to be considered listable. */
  minImageWidth: number;
  /** 'download' stores normalised copies locally; 'reference' records URLs only. */
  imageMode: "download" | "reference";

  /** Per-request network timeout, ms. */
  timeoutMs: number;
  /** Minimum gap between two requests to the same host, ms. */
  hostDelayMs: number;
  /** Honour robots.txt when scraping product pages. */
  respectRobots: boolean;
  /** User-Agent presented to third-party sites. */
  userAgent: string;

  /** Cache HTTP + LLM responses on disk so re-runs are near-free. */
  cache: boolean;
  /** Skip every network/LLM call — used to exercise the pipeline without a key. */
  dryRun: boolean;
  /** Re-process rows that already have an artifact. */
  force: boolean;

  /** Output roots, absolute paths. */
  dataDir: string;
  imageDir: string;
  cacheDir: string;
  reportDir: string;
  /** Public URL prefix that maps to imageDir when served by Next. */
  imageUrlBase: string;

  /** Hard ceiling on spend for a single run, USD. 0 disables the guard. */
  budgetUsd: number;
}

/**
 * Ordered fallbacks used when the configured model is not available on the account.
 * Deliberately mid-tier GPT only — no pro/premium tiers, since a catalog run touches
 * every row of a spreadsheet and cost scales linearly with the sheet.
 */
export const MODEL_FALLBACKS = [
  "openai/gpt-5.4-mini",
  "openai/gpt-5-mini",
  "openai/gpt-5.4-nano",
  "openai/gpt-5-nano",
];

/** Image grading needs vision; these all accept image input and support structured output. */
export const VISION_FALLBACKS = [
  "openai/gpt-5.4-mini",
  "openai/gpt-5-mini",
  "openai/gpt-5.4-nano",
  "openai/gpt-5-nano",
];

/** The search stage only relays citations, so the cheapest capable model is fine. */
export const SEARCH_FALLBACKS = [
  "openai/gpt-5.4-nano",
  "openai/gpt-5-nano",
  "openai/gpt-5.4-mini",
  "openai/gpt-5-mini",
];

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

/**
 * Builds a config from environment variables plus explicit overrides.
 * Overrides always win, which is how the CLI applies its flags.
 */
export function loadConfig(
  overrides: Partial<AgentConfig> = {},
  env: NodeJS.ProcessEnv = process.env,
  root = process.cwd(),
): AgentConfig {
  const base: AgentConfig = {
    apiKey: env.OPENROUTER_API_KEY ?? "",
    model: env.OPENROUTER_MODEL || MODEL_FALLBACKS[0],
    visionModel: env.OPENROUTER_VISION_MODEL || VISION_FALLBACKS[0],
    searchModel: env.OPENROUTER_SEARCH_MODEL || SEARCH_FALLBACKS[0],
    appUrl: env.OPENROUTER_APP_URL || "https://prakashwatch.co",
    appTitle: env.OPENROUTER_APP_TITLE || "Prakash Watch Co. Catalog Agent",

    concurrency: num(env.AGENT_CONCURRENCY, 3),
    maxSources: num(env.AGENT_MAX_SOURCES, 4),
    searchEngine: (env.AGENT_SEARCH_ENGINE as AgentConfig["searchEngine"]) || "parallel",
    searchMode: (env.AGENT_SEARCH_MODE as AgentConfig["searchMode"]) || "turbo",
    maxImages: num(env.AGENT_MAX_IMAGES, 5),
    minImageWidth: num(env.AGENT_MIN_IMAGE_WIDTH, 600),
    imageMode: (env.AGENT_IMAGE_MODE as AgentConfig["imageMode"]) || "download",

    timeoutMs: num(env.AGENT_TIMEOUT_MS, 20_000),
    hostDelayMs: num(env.AGENT_HOST_DELAY_MS, 1_200),
    respectRobots: bool(env.AGENT_RESPECT_ROBOTS, true),
    userAgent:
      env.AGENT_USER_AGENT ||
      "PrakashWatchCoCatalogBot/1.0 (+https://prakashwatch.co/about; catalog listing research)",

    cache: bool(env.AGENT_CACHE, true),
    dryRun: false,
    force: false,

    dataDir: `${root}/data/catalog`,
    // Outside public/: `next start` snapshots public/ at boot, so images the
    // agent writes afterwards would 404 until a restart. Served by /media.
    imageDir: `${root}/data/media`,
    cacheDir: `${root}/.agent-cache`,
    reportDir: `${root}/data/runs`,
    imageUrlBase: "/media",

    budgetUsd: num(env.AGENT_BUDGET_USD, 0),
  };

  return { ...base, ...overrides };
}
