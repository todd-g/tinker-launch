# Vercel Usage Dashboard for Minima Account

**Date:** 2026-06-09
**Type:** Build Log

## Context

While exploring how much Vercel/Convex resources our projects consume, we found that neither platform exposes billing/usage ($$, bandwidth, GB-hours) via public API — but Vercel's deployments API does expose enough to compute build minutes, deploy counts, and error rates per project. We built a Usage dashboard in Tinker Launch that polls this data for the Minima account, with a data model deliberately designed to extend to other accounts (e.g. toddgalloway personal) using different ingest methods later.

## What Changed

### New generic usage data model (`src/lib/db.ts`)

- **`usageDaily` table** — narrow metric rows: `(account, provider, projectSlug, date, metric, value, source)`. Unique key is `(account, provider, projectSlug, date, metric)` — `source` is informational (last writer wins) to prevent double-counting if an account ever switches ingest methods. This shape means a future log-drain receiver or scraper can emit new metrics (`invocations`, `bandwidth_bytes`) for other accounts with zero schema migration.
- **`jobRuns` table** — generic background-job log per the Build Philosophy (job, account, startedAt, finishedAt, status, detail JSON). Reusable by any future job.
- New db modules: `usageDaily` (upsertBatch/list/listAccounts/clear) and `jobRuns` (start/finish/list/lastSuccess).

### Vercel ingest (`src/lib/usage.ts`)

- `runVercelUsageIngest(accountKey, {days})` — reads the account's `vercel_token` from credentials.yaml, walks all teams → projects (paginated) → deployments (paginated past the API's 100-item cap using `until` cursors), buckets per local date, and emits 4 metrics per project/day: `deploys`, `prod_deploys`, `error_deploys`, `build_ms` (= `ready - buildingAt` summed).
- `runUsageIngestIfStale({force})` — throttled auto-ingest (6h) for all enabled accounts, following the `runCCParse` pattern; failures are logged to jobRuns without blocking the read path.
- Enabled accounts stored in settings key `usage.enabledAccounts`, defaults to `["minima"]`. Turning on another account later = add it to this setting.

### API routes

- `GET /api/db/usage` — returns metric rows (filters: account/provider/startDate/endDate), auto-ingests if stale, `force=1` to override.
- `POST /api/db/usage/ingest` — manual trigger with `{account, days}` (Admin action button per Build Philosophy).
- `GET /api/db/usage/runs` — ingest job log.

### UI (`src/app/usage/page.tsx` + layout)

- Account selector + 30/60/90-day range, summary cards (deploys, prod, build time, error rate, active projects), stacked-by-project deploys-per-day bar chart (recharts, matching the claude-code page style), per-project table sorted by build time, collapsible Ingest Log table, "Run Ingest" + "Backfill 90d" buttons.
- Sidebar nav: new "Usage" group (Gauge icon) in `src/components/app-sidebar.tsx`.

### Verified

- Backfilled 90 days for minima: 1 team, 21 projects, 317 deployments → 356 metric rows. Numbers match the earlier manual API probe (parkbench ~245 build-min on top).
- Throttled read path responds in ~50ms (no redundant re-ingest).
- `tsc --noEmit` and eslint clean; page screenshot-verified via Playwright.

## Files Modified

- `src/lib/db.ts` - Added `usageDaily` + `jobRuns` tables and access modules
- `src/lib/usage.ts` - New: Vercel API polling ingest with pagination + throttling
- `src/app/api/db/usage/route.ts` - New: read endpoint with auto-ingest
- `src/app/api/db/usage/ingest/route.ts` - New: manual ingest trigger
- `src/app/api/db/usage/runs/route.ts` - New: job log endpoint
- `src/app/usage/page.tsx` - New: Usage dashboard page
- `src/app/usage/layout.tsx` - New: sidebar/breadcrumb layout
- `src/components/app-sidebar.tsx` - Added Usage nav group

## Key Takeaways

- **Vercel/Convex usage APIs are dashboard-only.** Public APIs 404 on all billing/usage endpoints (probed extensively). `api.vercel.com/v1/usage` exists but rejects all date formats except rfc3339 and then 500s — not worth chasing. Deploy metadata is the honest, stable signal available.
- **Build minutes ≠ spend.** This dashboard tracks build activity, deploy frequency, and error rates — useful as a proxy and for spotting broken pipelines (e.g. sg-olo-playground had a 92% deploy failure rate), but real $$ still requires the provider dashboards.
- **The metric-row (EAV) shape was chosen deliberately** over wide columns so the personal account can later feed the same table from a different source (log drain, Web Analytics token, scraping) without migration. The `source` column distinguishes ingest methods.
- Convex has a personal access token at `~/.convex/config.json` that works against `api.convex.dev/api/dashboard/teams` (team + project lists only — no usage data). A future `convex` provider could at least track project inventory.
- Vercel deployments API caps at 100 per request; pagination uses `until = oldest.created - 1` cursors.
