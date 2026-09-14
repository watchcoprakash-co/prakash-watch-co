# One container, two processes — matches how this app is designed to run
# locally (see root README.md): the ingestion agent writes catalog artifacts
# straight onto the same disk Next.js reads them from, so both halves have to
# share a filesystem. Next.js is the only process Render routes public
# traffic to; agent-py stays bound to loopback and is reached the same way
# local dev reaches it (AGENT_SERVICE_URL=http://127.0.0.1:8077).
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- agent-py -----------------------------------------------------------------
COPY agent-py ./agent-py
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -e ./agent-py
ENV PATH="/opt/venv/bin:${PATH}"

# --- nextjs ---------------------------------------------------------------
# Pinned: newer npm defaults block install scripts unless explicitly
# approved (seen on Vercel's build — a warning there, but sharp needs its
# install script to fetch its native binary, so on a host without approval
# wired up it would silently break photo uploads instead). 10.9.3 is the
# version this was last verified against with a clean install.
RUN npm install -g npm@10.9.3

COPY nextjs/package.json nextjs/package-lock.json ./nextjs/
RUN cd nextjs && npm ci

COPY nextjs ./nextjs
RUN cd nextjs && npm run build

# The persistent disk mounts at nextjs/data empty on first boot, which would
# shadow the two files the repo ships in git (backdrops + the brand memory
# base). start.sh seeds them from here if the disk doesn't have them yet.
RUN mkdir -p /app/defaults \
    && cp nextjs/data/backdrops.json /app/defaults/backdrops.json \
    && cp nextjs/data/brands.json /app/defaults/brands.json

COPY start.sh ./start.sh
RUN chmod +x ./start.sh

ENV NODE_ENV=production
EXPOSE 3000

CMD ["./start.sh"]
