# Deploying Prakash Watch Co.

## Why this isn't a Vercel + Render split

Everything this app stores — the catalogue, stock ledger, GST bills, the
accounting journal, repair tickets — is a JSON file on local disk under
`nextjs/data/`, written with plain `fs` calls. The ingestion agent
(`agent-py/`) writes straight onto that same path. Neither half of the app
was built to talk to the other over a real API for storage; they share a
filesystem.

Vercel's serverless functions can't write to persistent disk, and
`nextjs/data/` isn't in git — so a Vercel deploy of the Next.js app alone
would boot with zero watches and a non-functional admin panel. Splitting
agent-py onto Render separately doesn't fix that either: it would write
catalog files onto *its own* disk, invisible to a Vercel-hosted Next.js
instance.

So both halves run together, on one host, sharing one disk — exactly how
[the root README](README.md) already describes running this locally in two
terminals. This document deploys that as one Render Web Service running both
processes in one container (see [Dockerfile](Dockerfile),
[start.sh](start.sh)). No application code was rewritten to get here — only
deployment plumbing (Docker, a health route, CORS, an env var pin) was added.

If you later want the storefront specifically on Vercel's edge network, that
needs a real (small) code change: the storefront's data-reading functions in
`nextjs/lib/` would fetch catalog data over HTTP from the Render origin
instead of reading local files. Not done here — ask for it separately if you
want it.

---

## 1. GitHub setup

This folder isn't currently a git clone (no `.git`), so first commit and push
it to the repo you want to deploy from:

```bash
git init
git add .
git commit -m "Prepare for production deployment"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

Double-check `git status` before committing — `.gitignore` already excludes
`.env`, `node_modules/`, `nextjs/data/` (the shop's live data: prices,
customer details, photos) and build output. Don't force any of those in.

Render (next section) deploys straight from this GitHub repo on every push
to `main`.

## 2. Render setup

**Cost note:** Render's free tier has no persistent disks, and this app
needs one. You'll need at least the **Starter** instance type
(render.yaml is pre-set to it) before this can hold real data. Nothing here
purchases anything on its own — that happens when you connect billing in the
Render dashboard.

### Option A — Blueprint (uses the committed `render.yaml`)
1. [dashboard.render.com](https://dashboard.render.com) → **New +** → **Blueprint**.
2. Connect the GitHub repo from step 1.
3. Render reads [render.yaml](render.yaml) and proposes one Web Service
   (`prakash-watch-co`), Docker runtime, a 5GB disk mounted at
   `/app/nextjs/data`.
4. It will prompt for every env var marked `sync: false` — see the table
   below. Fill them in, then **Apply**.

### Option B — Manual
1. **New +** → **Web Service** → connect the repo.
2. Runtime: **Docker**. Root directory: repo root (the `Dockerfile` is
   already there).
3. Instance type: **Starter** or above (needs a disk).
4. **Disks** tab → add a disk, mount path `/app/nextjs/data`, size 5GB (grow
   later if the catalogue and its photography outgrow it).
5. **Settings** → Health Check Path: `/api/health`.
6. Add the environment variables below, then deploy.

### Environment variables (Render dashboard → Environment)

| Variable | Value | Secret |
|---|---|---|
| `OPENROUTER_API_KEY` | your OpenRouter key | **yes** |
| `OPENROUTER_MODEL` | `openai/gpt-5.4-mini` | no |
| `OPENROUTER_VISION_MODEL` | `openai/gpt-5.4-mini` | no |
| `OPENROUTER_SEARCH_MODEL` | `openai/gpt-5.4-nano` | no |
| `OPENROUTER_APP_URL` | `https://prakashwatchco.in` | no |
| `OPENROUTER_APP_TITLE` | `Prakash Watch Co. Catalog Agent` | no |
| `ADMIN_PASSWORD` | choose one | **yes** |
| `ADMIN_SECRET` | 32+ random bytes, e.g. `openssl rand -hex 32` | **yes** |
| `AGENT_SERVICE_URL` | `http://127.0.0.1:8077` | no — both processes share one container |
| `AGENT_SERVICE_TOKEN` | random shared secret, e.g. `openssl rand -hex 32` | **yes — see below** |
| `AGENT_ALLOWED_ORIGINS` | `https://prakashwatchco.in,https://www.prakashwatchco.in` | no |
| `NODE_ENV` | `production` | no |

⚠️ **Set `AGENT_SERVICE_TOKEN`.** Left unset, agent-py trusts every request
with no auth at all — fine on localhost, not once the service is
network-reachable at all (see "Common errors" if you ever expose it beyond
this one container).

## 3. Vercel setup

**Known limitation, by choice:** this deploys the exact same code as Render,
unmodified. Vercel can't reach the disk that holds the catalogue, so the
storefront will show 0 watches, and every write path (admin edits, billing,
repair tickets) will fail — the public repair form specifically will show a
raw error rather than a clean message, since that route has no fallback for
a disk it can't write to. This deployment is for confirming the build
pipeline and having a live Vercel URL, not for real traffic. See the
recommended fix mentioned at the top of this file when you're ready to make
it functional.

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository** →
   select `watchcoprakash-co/prakash-watch-co`.
2. On the **Configure Project** screen: **Root Directory → Edit → select
   `nextjs`**. This is the one setting that matters — the repo is a
   monorepo (`nextjs/` + `agent-py/`), and Vercel needs to be told which
   half to build. Framework Preset should auto-detect as **Next.js** once
   that's set.
3. Environment variables (all optional for this throwaway deploy — add them
   only if you want to click through the login screen; nothing will persist
   after):
   | Variable | Value |
   |---|---|
   | `ADMIN_PASSWORD` | anything, if you want `/login` to succeed |
   | `ADMIN_SECRET` | anything 32+ chars |
   Leave `AGENT_SERVICE_URL` unset — there's no agent-py reachable from
   Vercel, so ingestion-related admin pages will show a clear "could not
   reach the agent" message instead of trying to hit `127.0.0.1`.
4. **Deploy.** Build should complete clean (verified locally before this was
   pushed). You'll get a `*.vercel.app` URL — don't point
   `prakashwatchco.in` at it; that domain belongs to the Render deployment
   in this plan.

## 4. Hostinger DNS configuration

In Render: **Settings → Custom Domains → Add** `prakashwatchco.in` and
`www.prakashwatchco.in`. Render will show you the exact record(s) to add —
usually an `A`/`ANAME` (or Render's apex-domain record) for the bare domain
and a `CNAME` pointing `www` at the `.onrender.com` hostname. Copy exactly
what Render displays; it can change.

In Hostinger: **hPanel → Domains → prakashwatchco.in → DNS / Nameservers →
DNS Zone Editor**, add those same records. Remove any existing `A`/`CNAME`
record on the same host name first (e.g. a parking-page record Hostinger
added by default) — two records on the same name will conflict.

DNS propagation is usually under an hour, occasionally up to 24-48h. Render
issues a free TLS certificate automatically once it can verify the domain
points at it.

## 5. Custom domain configuration

Once DNS resolves, both `https://prakashwatchco.in` and
`https://www.prakashwatchco.in` serve the same Render service. No
`api.prakashwatchco.in` is needed — agent-py isn't reachable outside the
container in this setup. Set `OPENROUTER_APP_URL` (step 2) to the apex
domain, which is already done in the table above.

## 6. CORS configuration

Already wired: `agent-py` reads `AGENT_ALLOWED_ORIGINS` and only allows
`https://prakashwatchco.in` and `https://www.prakashwatchco.in`
([agent-py/prakash_agent/server.py](agent-py/prakash_agent/server.py)). In
today's topology this is a no-op in practice — the browser never calls
agent-py directly, Next.js proxies it server-side, and agent-py is bound to
loopback only. It's there so nothing breaks if that ever changes.
`AGENT_SERVICE_TOKEN` is the actual access control, not CORS.

## 7. Database configuration

There is no database. All data lives as JSON under `nextjs/data/` on the
Render disk mounted in step 2. Back it up periodically — Render's disk
snapshots, or a scheduled job that copies `nextjs/data/` somewhere durable
(this repo doesn't include one; ask if you want it set up).

## 8. Production testing checklist

- [ ] `https://prakashwatchco.in/api/health` returns `{"ok":true}`
- [ ] Homepage loads; collection counts show `0` (expected — no catalogue
      uploaded yet)
- [ ] `/login` → sign in with `ADMIN_PASSWORD` → reaches `/admin`
- [ ] `/admin/sources` → upload a small test sheet (or use "Add one watch by
      hand") → confirms the container's internal agent-py is reachable and
      `OPENROUTER_API_KEY` works
- [ ] A researched watch appears under `/admin/review/<sku>`, gets approved,
      and shows up on `/collections`
- [ ] `/admin/billing/new` → create a test bill → stock decrements, bill
      appears in `/admin/books`
- [ ] `/service` (public repair form) → submit a test ticket → appears on
      `/admin/repairs`
- [ ] Redeploy the service (push an empty commit) → confirm the catalogue,
      bill, and ticket from above are **still there** — this is the one that
      proves the persistent disk is actually mounted correctly
- [ ] Load `/admin` from a private/incognito window without the cookie →
      redirects to `/login` rather than showing data

## 9. Common errors and fixes

| Symptom | Cause | Fix |
|---|---|---|
| Storefront shows 0 watches after first deploy | Expected — the catalogue is a live disk, not git. Nothing has been ingested yet | Log into `/admin`, upload a stock sheet |
| Catalogue/bills/tickets disappear after a redeploy | The persistent disk isn't mounted at `/app/nextjs/data`, or you're on an instance type without a disk | Check Render → Disks tab; confirm the mount path exactly matches |
| "Could not reach the ingestion agent" in the admin panel | agent-py crashed or never started inside the container | Render → Logs; restart the service. If it keeps happening, check `OPENROUTER_API_KEY` is set — agent-py itself boots without it, but every research call will fail |
| 401 on every ingest/refresh/rerun call | `AGENT_SERVICE_TOKEN` set on one side (Next.js env or agent-py env) but not the other, or they don't match | Both env vars must be the same value — they're the same container, so this is one variable set once, not two to keep in sync |
| SSL warning on the custom domain | DNS not fully propagated yet, or the record doesn't match what Render asked for | Re-check the DNS Zone Editor in Hostinger against Render's Custom Domains page exactly |
| Build fails on `sharp` or `lxml`/`pillow` | Shouldn't happen — the Dockerfile builds on Debian (glibc), which has prebuilt wheels/binaries for all of these | Check the Render build logs for the actual error; likely unrelated (e.g. a real syntax error) |
| Admin login always says wrong password | `ADMIN_PASSWORD` not set, or set with surrounding whitespace/quotes pasted in from somewhere | Re-enter it in the Render dashboard, no quotes |
