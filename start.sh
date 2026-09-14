#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="/app/nextjs/data"
mkdir -p "$DATA_DIR"

# First boot on a fresh persistent disk: seed the two files the repo ships in
# git. Never overwrites anything the shop or the agent has since written.
[ -f "$DATA_DIR/backdrops.json" ] || cp /app/defaults/backdrops.json "$DATA_DIR/backdrops.json"
[ -f "$DATA_DIR/brands.json" ] || cp /app/defaults/brands.json "$DATA_DIR/brands.json"

# The ingestion agent. Bound to loopback only, same as local dev — it is not
# reachable from outside this container even if AGENT_SERVICE_TOKEN is unset.
uvicorn prakash_agent.server:app --host 127.0.0.1 --port 8077 &

cd nextjs
exec node_modules/.bin/next start -p "${PORT:-3000}"
