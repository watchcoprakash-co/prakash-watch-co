# Prakash Watch Co.

The shop's website and the agent that fills it.

Two pieces, one contract:

| | |
| --- | --- |
| **`agent-py/`** | Python + LangGraph ingestion agent. Reads the stock spreadsheet, researches each watch, writes artifacts. |
| **`nextjs/`** | The website: storefront, collections, product pages, and the admin panel the shop uses. |

They only meet at the artifact format — `nextjs/data/catalog/*.json` plus images in `nextjs/public/catalog/`. The agent writes them, the admin panel edits them, the storefront reads them.

## Setup, once

```bash
python3 -m venv .venv
.venv/bin/pip install -e agent-py

cd nextjs && npm install && cd ..
```

Then fill in `.env` (copy from `.env.example`). It needs an OpenRouter key and an admin password; both halves read this one file.

## Running it

Three terminals, or three background processes:

```bash
# 1. the ingestion agent (only needed for uploads from the admin panel)
.venv/bin/uvicorn prakash_agent.server:app --port 8077

# 2. the website
cd nextjs && npm run dev

# 3. or ingest straight from the command line, no server needed
.venv/bin/prakash-agent "STOCK DETAILS FOR WEBSITE.xlsx" --limit 3
```

| URL | What it is |
| --- | --- |
| `/` | Homepage. The index section shows live stock counts per family. |
| `/collections` | Everything listed, filterable by family. |
| `/watch/<sku>` | Product page, with each specification linked to the page it was read from. |
| `/admin` | Stock room: upload a sheet, watch the run, review and publish. |
| `/login` | Admin sign-in (`ADMIN_PASSWORD` in `.env`). |

## Who decides what

The spreadsheet is the source of truth. **Prices, MRP, stock and references always come from it** — nothing found online can change them. The agent's job is to fetch **photographs and write the description**, and to fill in fields like model name or collection only where the sheet leaves them blank.

## The flow

1. The shop uploads its stock sheet at `/admin` (or runs the CLI).
2. The agent researches each watch and writes an artifact, marked `ready` or `needs_review`.
3. Nothing is public yet. The shop reviews flagged listings at `/admin/review/<sku>`, fixes anything wrong, and publishes.
4. Published watches appear on `/collections` and the homepage immediately.

Details: [`agent-py/README.md`](agent-py/README.md).

## Notes

- `.env` holds live credentials and is gitignored. Rotate the OpenRouter key if it ever leaks.
- The agent writes to the local filesystem. That is right for running it on the shop's machine or in CI; deploying the agent itself to a serverless platform would need the artifacts moved to object storage first.
