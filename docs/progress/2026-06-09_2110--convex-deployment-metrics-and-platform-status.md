# Convex Deployment Metrics & Platform Status Integration

**Date:** 2026-06-09
**Type:** Build Log

## Context

The ask was platform-native observability: real Convex/Vercel usage, response times, and incidents — not just synthetic probes. The breakthrough: Convex deployments expose the same `app_metrics` API the official dashboard uses, and our deploy keys in credentials.yaml authenticate against it. The exact endpoints and the (non-obvious) query format came from the open-source `get-convex/convex-backend` repo. Both platforms also run public statuspage.io JSON APIs for platform-level incidents.

## What Changed

### Convex deployment metrics (`src/lib/convex-health.ts`)

Talks directly to `https://{deployment}.convex.cloud/api/app_metrics/*` with `Authorization: Convex {deploy_key}` (the full `prod:name|token` string). Key format details that took reverse-engineering:

- `window` param is JSON: `{"start": {"secs_since_epoch": N, "nanos_since_epoch": 0}, "end": {...}, "num_buckets": K}` — NOT plain unix timestamps (that's why earlier probes 400'd).
- Deployment-wide endpoints (window + k only): `function_call_count_top_k`, `failure_percentage_top_k`, `cache_hit_percentage_top_k`. Responses include a `_rest` catch-all bucket.
- Per-function endpoints (need `udfPath`): `latency_percentiles` (with `percentiles=[50,95]`), `udf_rate`, `cache_hit_percentage`. `udfType` is optional.
- `num_buckets: 1` gives a single aggregate over the window — used for failure % and latency; 24 buckets for the hourly call sparkline.

`getConvexHealth()` fans out to every production deployment in `credentials.yaml.convex_keys` (deployment name parsed from the key's `prod:{name}|` prefix), pulling: total calls 24h, hourly call series, top-3 functions with p50/p95 latency, and per-function failure rates. Also persists a daily `function_calls_24h` snapshot into `usageDaily` (provider=`convex`, source=`convex_deployment_api`) for future trends.

### Platform status (`src/app/api/platform-status/route.ts`)

Fetches `vercel-status.com/api/v2/summary.json` + `status.convex.dev/api/v2/summary.json` — platform status indicator + active incidents with links. No auth needed.

### UI (`src/app/usage/convex/page.tsx`)

Platform status banners (green/amber/red dot + incident links), summary cards (total calls, deployments, failing functions, unreachable), a cross-deployment "Failing Functions" card sorted worst-first, and per-deployment cards with hourly call sparkline, top functions (calls · p50 · p95), and failure badges. Added "Convex" to the Usage sidebar group.

### First live read

All 8 prod deployments reachable: parkbench 1,767 calls/24h, propagator 1,720, opsworx 517. **Real failures surfaced immediately**: parkbench `calendar.js:weekEvents` failing at 29%, `push/triggers.js:checkPushReminders` 17%, `email/queries.js:getEventsInWindow` 14%. Convex itself had an active incident at the time ("Elevated error rate on some Pro deployments") — visible in the status banner, possibly related.

## Files Modified

- `src/lib/convex-health.ts` - New: deployment metrics client + fan-out + daily snapshot persist
- `src/app/api/db/convex-health/route.ts` - New: live health endpoint
- `src/app/api/platform-status/route.ts` - New: statuspage.io aggregator
- `src/app/usage/convex/page.tsx` - New: Convex health page
- `src/components/app-sidebar.tsx` - Added "Convex" nav item

## Key Takeaways

- **Convex deploy keys are full admin keys for the deployment's HTTP API** — everything the Convex dashboard health page shows is fetchable: call counts, failure rates, cache hit rates, latency percentiles, even streaming function logs (`stream_function_logs`).
- **The open-source convex-backend repo is the API documentation.** `npm-packages/dashboard-common/src/lib/appMetrics.ts` (client) and `crates/local_backend/src/app_metrics.rs` (handlers/params). When a Convex endpoint 400s, check the Rust handler's `QueryArgs` struct.
- **statuspage.io JSON APIs** (`/api/v2/summary.json`) work for both platforms, free, no auth — platform incidents are easy to surface anywhere.
- Still closed: Vercel's own usage/$$/RUM data (dashboard-only), and Convex team-level billing usage (the `api.convex.dev/api/dashboard/teams/{id}/usage*` paths all 404 — billing data lives in a separate service the CLI access token doesn't reach).
- The convex-health page does a live fan-out on load (~2-4s for 8 deployments, parallel). Fine at this scale; if it grows, cache with the jobRuns throttle pattern.
