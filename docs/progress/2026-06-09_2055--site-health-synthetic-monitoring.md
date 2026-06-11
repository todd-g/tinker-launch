# Site Health: Synthetic Uptime & Response-Time Monitoring

**Date:** 2026-06-09
**Type:** Build Log

## Context

After building the Deploy Usage dashboard, the real ask turned out to be page speed, response times, and incidents/errors — not deploy counts. We confirmed (by probing) that Vercel's runtime logs are live-tail streaming only (`/v1/projects/{pid}/deployments/{did}/runtime-logs` holds the connection open; nothing historical), and Speed Insights / Web Analytics / Observability have no read APIs. The free, build-now answer is synthetic monitoring: Tinker Launch probes each project's production URL itself and derives incidents from failed checks.

## What Changed

### `siteChecks` table (`src/lib/db.ts`)

Raw probe results: `(projectSlug, org, url, checkedAt, status, ok, ttfbMs, totalMs, error)`. `status = 0` means network/DNS/timeout failure. 90-day retention with cleanup on each run. Aggregates (uptime %, percentiles, incidents) are computed at read time — no rollup table needed at this scale (~14 URLs).

### Checker (`src/lib/site-health.ts`)

- `runSiteChecks()` — probes every non-archived project with a `prodUrl` (normalizing missing `https://`), all concurrently. Measures TTFB (fetch headers resolved) and total time (body drained). 15s timeout, custom User-Agent `TinkerLaunch-HealthCheck/1.0`. Logs to `jobRuns` as `site_health_check` with per-site failure details.
- `runSiteChecksIfStale()` — 10-minute throttle on the read path (same pattern as usage ingest).
- `getSiteHealth({days})` — per-project aggregates (last check, uptime %, p50/p95 TTFB, time series) plus **derived incidents**: each window of consecutive failed checks becomes one incident with start/end/ongoing state. No separate incident store to keep consistent.

### API routes

- `GET /api/db/site-health?days=7` — aggregates + incidents, auto-checks if stale
- `POST /api/db/site-health/run` — manual check sweep (Admin action button)

### UI (`src/app/usage/health/page.tsx`)

Summary cards (sites up, incidents, median TTFB, slowest p95), per-site table with status dot, HTTP status badge (error tooltip on failures), color-coded TTFB (green <400ms / amber <1.2s / red above), p50/p95, uptime %, TTFB sparkline, and an Incidents table (started, duration, failed checks, last error, resolved/ongoing). Range selector 24h/7d/30d. Added "Site Health" to the Usage sidebar group.

### First sweep results

All 14 sites with prod URLs returned 200. Notable: IndomaMVP TTFB was 2.0s (likely serverless cold start — exactly the kind of thing this view surfaces), laudeslearning fastest at 336ms.

## Files Modified

- `src/lib/db.ts` - Added `siteChecks` table + module
- `src/lib/site-health.ts` - New: prober, throttle, aggregation, incident derivation
- `src/app/api/db/site-health/route.ts` - New: read endpoint with auto-check
- `src/app/api/db/site-health/run/route.ts` - New: manual trigger
- `src/app/usage/health/page.tsx` - New: Site Health page
- `src/components/app-sidebar.tsx` - Added "Site Health" nav item

## Key Takeaways

- **Vercel runtime logs are tail-only.** The endpoint exists but streams from connect-time forward — useless for history without a persistent daemon holding one connection per project. Not worth it.
- **Checks only run while the dashboard is in use** (10-min throttle piggybacked on page views) plus manual runs. For true 24/7 incident detection, a LaunchAgent that curls `POST /api/db/site-health/run` every 5 minutes would follow the window-tracker precedent — deliberately deferred.
- **Incidents are derived, not stored.** Consecutive failed checks group into incident windows at read time. With sparse checks, incident "duration" is bounded by check frequency — fine for a hobbyist dashboard, worth remembering when reading the numbers.
- TTFB from a local machine includes home-network latency (~constant offset). Trends and relative comparisons are meaningful; absolute numbers are not RUM.
- Real $$ usage / function invocations / web vitals remain dashboard-only at Vercel. The paths that would unlock them: log drain → Axiom (minima is Pro), or Speed Insights (paid per project, and still no read API).
