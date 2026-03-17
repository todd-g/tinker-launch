# Activity Matching Improvements & Browser URL Capture

**Date:** 2026-03-16
**Type:** Build Log

## Context

The activity tracking system was capturing window focus data but had weak project matching — many windows (especially browser tabs and unregistered projects) were showing as "Unmatched." The matching logic only used window titles, which missed production URLs, Linear workspaces, and projects not yet registered in Tinker Launch. Browser matching was particularly fragile since it relied on project names appearing in page titles rather than checking actual URLs.

## What Changed

### 1. Browser URL Capture in Window Tracker

Updated `scripts/window-tracker.sh` to capture the active browser tab URL using AppleScript for Chrome, Brave, Safari, and Arc. The URL is stored as a new `url` field in the JSONL entries and in the `activitySnapshots` SQLite table. This is the foundation for reliable browser matching — URLs contain domains, ports, and paths that titles often omit.

### 2. New Project Fields for Matching

Added three new columns to the `projects` table via migrations:
- `prodUrl` — Production domain (e.g., `parkbench.nyc`, `app.indoma.care`)
- `stagingUrl` — Staging/preview domain (e.g., `parkbench-nyc.vercel.app`)
- `aliases` — Comma-separated alternative names for title-based matching
- `linearSlug` — Linear workspace slug for matching `linear.app/{slug}/...` URLs

### 3. Populated URLs from Vercel API

Queried the Vercel API using tokens from `credentials.yaml` for both personal and minima accounts. Automatically populated `prodUrl` and `stagingUrl` for 22 projects. Custom domains like `parkbench.nyc`, `opsworx.app`, `twotruthsandabot.com`, `clodd.minima.nyc`, etc. were set as prod URLs; `.vercel.app` subdomains as staging.

Manually set:
- Indoma: `app.indoma.care` (prod), `app-staging.indoma.care` (staging)
- Pollinator: `pollinator.coop` (prod)
- Tally: `tally.super.green` (prod), `sg-tally.vercel.app` (staging)
- Maybe: `maybe.super.green` (prod)

### 4. Registered Missing Projects

Added IndomaMVP (port 8004) and pollinator-api (port 3028) to the projects database — these were active projects that weren't registered in Tinker Launch, causing all their terminal and browser activity to go unmatched.

### 5. Rewrote Browser Matching to be URL-First

`matchBrowser()` in `src/lib/activity.ts` now:
1. **URL-first**: Checks actual URL for `localhost:PORT`, `linear.app/{slug}`, prod domain, staging domain
2. **Title fallback**: For legacy snapshots without URL, falls back to checking titles for domains, aliases, repoName, projectName

### 6. Added Linear Workspace Matching

New matching for `linear.app/{workspace-slug}` URLs. Indoma Linear (`linear.app/indoma/...`) maps to IndomaMVP; Minima Linear (`linear.app/minimagroup/...`) maps to Pollinator API.

### 7. Added Slack Matching

New `matchSlack()` function matches Slack window titles containing project names, repo names, or aliases (e.g., "project-park-bench (Channel)" matches Park Bench).

### 8. Re-match Endpoint & UI

Added `POST /api/db/activity` with `action: "rematch"` that retroactively re-processes all unmatched snapshots with the improved matching logic, updates their project attribution, and aggregates into daily totals. Added a "Re-match" button in the Activity page header.

### 9. Fixed UTC Date Bug

All date calculations (`getDateRange`, weekly chart, ingestion bucketing, CC parse dates, re-match dates) were using `toISOString()` which returns UTC. At 8 PM EDT this caused "today" to query for tomorrow's date, making all data appear to vanish. Replaced with local timezone date formatting throughout.

## Files Modified

- `scripts/window-tracker.sh` — Added URL capture for Chrome, Brave, Safari, Arc via AppleScript
- `src/lib/db.ts` — Added `prodUrl`, `stagingUrl`, `aliases`, `linearSlug` columns to projects; `url` column to activitySnapshots; new methods: `updateUrls`, `updateAliases`, `updateLinearSlug`, `listUnmatched`, `updateMatch`; updated `insertBatch` to include URL
- `src/lib/activity.ts` — Added `linearSlug` to ProjectInfo; rewrote `matchBrowser()` to be URL-first with title fallback; added `matchSlack()`; added `classifyBrowserContext()`; updated ingestion to pass URL; fixed UTC date bucketing with `toLocalDateString()`
- `src/app/api/db/activity/route.ts` — Added POST handler with `rematch` action; passes URL to matching; fixed UTC date bug
- `src/app/api/db/projects/route.ts` — Added `updateUrls`, `updateAliases`, `updateLinearSlug` actions
- `src/app/activity/page.tsx` — Added Re-match button with result feedback; fixed UTC date bug in `getDateRange()` and weekly chart with `toLocalDateString()`

## Key Takeaways

- **URL > title for browser matching.** Window titles are unreliable — a page titled "Dashboard" gives no project context. The actual URL always contains the domain, making matching deterministic.
- **`toISOString()` returns UTC, not local time.** This caused a subtle bug where evening users in US timezones would see "today" filter return empty data because it was querying tomorrow's date. Always use local date formatting for user-facing date boundaries.
- **Re-match is essential when improving matching logic.** Historical snapshots need to be retroactively updated when matching rules change or new projects are registered. The re-match endpoint went from 180 unmatched to 41 (all genuinely generic: YouTube, System Settings, empty terminals).
- **Linear workspace slug is in the URL path** (`linear.app/{slug}/...`), making it trivial to attribute Linear usage to projects.
- **Vercel API** (`GET /v9/projects` + `GET /v9/projects/{id}/domains`) is a good source for auto-populating prod/staging URLs. Tokens from `credentials.yaml` work directly.
