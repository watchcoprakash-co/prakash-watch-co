import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Next only auto-loads .env files inside this directory, but the project keeps a
// single .env at the repo root so the app and the ingestion CLI share one file.
// dotenv never overrides an already-set variable, so .env.local and real
// deployment environment variables still win.
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
