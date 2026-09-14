# Catalog ingestion agent — Python + LangGraph

Takes the shop's stock spreadsheet (brand, model number, price) and produces everything needed to list each watch: verified specifications, photographs and shop copy, as one validated artifact per watch.

The Next.js site in `../nextjs` reads those artifacts. The two halves only ever meet at the artifact format.

## The graph

**Per watch** — cyclic on purpose. The router asks whether anything found so far actually mentions the reference; if not it loops back for a differently-phrased query before giving up and reading what it has.

```
search ──▶ (reference confirmed?) ──no──▶ search
                  │ yes
                  ▼
   scrape ─▶ extract ─▶ copy ─▶ images ─▶ assemble
```

**Per sheet** — every row is fanned out to the watch graph with `Send`, bounded by `max_concurrency`, then fanned back in to write the index and the run report. Rows are independent, so one unreachable site cannot cost the shop the other two hundred listings.

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -e agent-py
```

Configuration comes from the repo-root `.env` (see `.env.example`) — the same file the website uses.

## Running it

```bash
prakash-agent "STOCK DETAILS FOR WEBSITE.xlsx"      # full run
prakash-agent sheet.xlsx --limit 3                  # trial on three rows
prakash-agent sheet.xlsx --dry-run                  # no network, no spend
prakash-agent sheet.xlsx --only seiko               # one brand or reference
prakash-agent sheet.xlsx --force                    # redo rows that already have artifacts
prakash-agent --template ../stock-template.xlsx     # starter spreadsheet
```

With no file argument it picks the most recently modified spreadsheet in the project.

| Flag | Effect |
| --- | --- |
| `--limit <n>` / `--only <a,b>` | Trial run / filter by brand or reference |
| `--force` | Re-process rows that already have an artifact |
| `--no-cache` | Ignore the on-disk cache |
| `--reference-images` | Record image URLs instead of downloading copies |
| `--concurrency <n>` | Rows in flight at once (default 3) |
| `--images <n>` / `--sources <n>` | Images kept / pages read per watch |
| `--engine <name>` | `parallel` (default, cheapest), `exa`, `native` |
| `--budget <usd>` | Stop the run once this much has been spent |

## Serving the admin panel

```bash
uvicorn prakash_agent.server:app --port 8077
```

The site's upload route proxies to `/ingest` and pipes the agent's server-sent events straight to the browser, so the admin watches the run happen. Set `AGENT_SERVICE_TOKEN` in `.env` if the agent is not on localhost.

## What comes from where

The stock list is the source of truth. The agent researches **photographs and descriptive content**, and nothing else.

| | Comes from |
| --- | --- |
| Price, MRP, discount | **The sheet, always.** Never touched by research. |
| Quantity, in stock | **The sheet, always.** |
| Brand, reference | **The sheet, always.** |
| Model name, gender, collection | **The sheet when you fill it in**; researched only if you leave it blank. |
| Photographs | Researched — unless you supply your own in `Image URLs`, which always win. |
| Description, tagline, bullets, SEO | Written from confirmed specifications only. |
| Specifications table | Researched, and every line is cited to the page it came from. |

A price found online never overrides yours. If a page quotes a wildly different price the listing is flagged, but the flag is read as *"that page may describe a different watch"* — a prompt to check the photographs, not a doubt about your pricing.

## The spreadsheet

Only **brand**, **model number** and **price** are required, and the parser adapts to how the shop already writes them. From the real stock file:

- **One tab per brand**, and the tabs disagree with each other. Every tab is read on its own terms.
- **`Group`** means brand; **`Amount`** means the discounted selling price.
- A tab with **only MRP** is fine — MRP becomes the shelf price.
- The **brand's website in the header row** is picked up and used to recognise official sources.
- Distributor codes (`INDIAN CODE`), `Unit` and other unknown columns are ignored and reported.

Optional columns that measurably improve results: **Model Name**, **Product URL** (skips search entirely — cheapest and most accurate), **Image URLs** (the shop's own photographs, which always outrank anything found online), **MRP**, **Gender**, **Collection**, **Qty**, **Notes**.

Rows that cannot be used are reported, never silently dropped.

## What it produces

```
nextjs/data/catalog/<sku>.json      the artifact — specs, copy, images, sources, confidence
nextjs/data/catalog/index.json      compact list the collections page reads
nextjs/public/catalog/<sku>/*.webp  normalised images (max 1600px) + blur placeholders
nextjs/data/runs/<runId>.md         what needs a human look, and why
```

Every artifact is validated by pydantic before it is written and again by zod before the site renders it.

## Where sources come from

Specifications are held to Indian sources wherever possible, because the Indian
article is often a different reference from the global one (EFR-539DE-8AV here
against EFR-539DE-8A abroad) and carries a different warranty. `brands.py` holds
the brands' Indian sites, India's authorised retailers, and a list of foreign
storefronts to keep out. An Indian page always outranks a foreign one, and a
brand's own site only counts as the brand speaking when it is the Indian locale —
`casio.com/intl` does not get to answer for `casio.com/in`.

Two things were measured rather than assumed:

- **Most Indian brand sites refuse bots.** casio.com/in, titan.co.in, fastrack.in,
  sonatawatches.in, citizenwatches.in and ethoswatches.com all answer 403 or
  nothing. Those are marked in the registry and skipped rather than retried. Seiko
  India and Tissot India are readable and are used.
- **Strict India-only starves the agent.** With `AGENT_INDIA_ONLY=1`, six watches
  produced two sources between them and nothing publishable, because the search
  backends surface very few Indian product pages. It is available for when that
  changes; the default is India-*first*, which keeps coverage.

Photographs are exempt from all of this. The same reference looks identical
wherever it is listed, so images are gathered from marketplaces and foreign shops
too — only specification claims are held to the Indian market.

## Getting the right photograph

A wrong colourway is the failure that matters: G-Shock ships one case in a dozen
colours, and publishing the yellow one against a blue reference is a mistake a
customer notices at the counter.

So the vision model is not asked "does this match?" — a question that invites
agreement. It is asked to **report what it can see**: dial colour, strap material,
analogue or digital. Those readings are then checked in code against the
specifications already confirmed from sources, and a photograph that contradicts
them is dropped with the reason recorded. Near misses are tolerated deliberately
(*dark blue* satisfies *blue*, silver and white dials are not separated), because
losing a good photograph costs far less than publishing the wrong watch.

Measured on the G-Shock and Seiko references that previously failed, this rejected
a neon-yellow variant, a dark-grey variant, a black-dial Seiko 5 and a different
chronograph entirely, while keeping the correct blue article in each case.

## How accuracy is protected

Watch specifications are exactly what a language model invents fluently. A shop that publishes an invented 300 m water-resistance rating owns that claim at the counter, so the agent under-claims rather than guesses:

- **Everything is cited.** Each fact carries the index of the page it was read from; facts whose citation does not resolve are dropped before assembly. A missing spec is correct, an invented one is not.
- **The copywriter only sees confirmed facts** and cannot mention a specification no source stated.
- **References are checked, not assumed.** Search returns neighbours constantly — `T127.407.11.041.00` surfaces `…051.00`, `EFR-539DE-8AV` surfaces `EFR-539DE-3AV`. Candidates are scored on normalised reference matching (brands strip separators in URLs, so `T127.407.11.041.00` → `t1274071104100` is a strong signal), and Indian-market suffixes (`AV`, `UDF`, `K1`) are normalised so a regional reference still matches the global page.
- **Sources are ranked by trust:** official brand site → known retailer → marketplace → editorial.
- **Images are looked at.** Candidates are downloaded, de-duplicated with a perceptual hash, then graded by a vision model. In testing this rejected payment-logo strips, a dealer certificate, and a Baby-G photo on an Edifice listing.
- **Prices are sanity-checked** against any rupee price found on the page.

Nothing auto-publishes. Each artifact carries `status` (`ready` / `needs_review`), a confidence breakdown and review flags explained in the run report and the admin panel.

## Cost

Roughly **$0.01 per watch** with the default mid-tier GPT models — the 37-row stock file costs about $0.40.

Search dominates the variable cost, which is why the cheapest backend is the default: `parallel/turbo` measured **$0.0014** per search against **$0.0118** for the default and **$0.0073** for `exa`.

Query phrasing was measured too, and bare wins: `TITAN 95047WM01 watch` returned the official product page and the retailer listings, while padding it with "specifications official product page" or pinning it with `site:` returned generic category pages. The reference is a rare token; extra words dilute it.

HTTP responses, model replies and downloaded images are cached in `.agent-cache/`, and rows that already have an artifact are skipped unless `--force` is passed — so fixing three rows in a 200-row sheet only pays for those three.

## Being a good citizen of other people's sites

Requests are throttled per host, identified by a real User-Agent, bounded by a timeout, and checked against `robots.txt` before any page is read.

**Image rights are the shop's call.** Downloaded images record `sourceUrl` and `sourcePage` so provenance is auditable. Brand press imagery is normal practice for an authorised dealer, but it is worth confirming per brand — and the shop's own photographs, supplied via the `Image URLs` column, always win. `--reference-images` records URLs without storing copies.

## Known limits

- Some Indian-market references (several Casio Edifice, most Titan) have good specification coverage but no findable product photography. They land in `needs_review` with `no-images`. Filling the `Image URLs` column, or the `Product URL` column, fixes these completely.
- `titan.co.in` returns HTTP 403 to non-browser clients, so it cannot be scraped even when it is the right page. Titan listings are built from retailer sources instead.
- Legacy `.xls` is not supported — re-save as `.xlsx`.
