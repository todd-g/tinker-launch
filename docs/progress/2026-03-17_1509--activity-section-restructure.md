# Activity Section Restructure: Universal Filters & Auto-Rematch

**Date:** 2026-03-17
**Type:** Build Log

## Context

The Activity section had grown into a 1,750-line monolithic page with 5 tabs (Overview, Timeline, Snapshots, Daily, CC Usage), each with their own local filter state. The user wanted to strip it back to just the Timeline table as the single source of truth, make all filters universal across the Activity section, and remove the manual Re-match button in favor of automatic background processing.

## What Changed

### 1. Universal Filter Architecture

Created `src/hooks/use-activity-filters.ts` — a hook backed by URL search params (`?range=week&project=xyz&org=minimagroup`). Any page under `/activity` reads the same filter state. Filters survive page navigation and refresh without needing a React context provider.

Filters: date range (1D/7D/30D/All), org, project (filtered by selected org), plus page-specific filters (source, activity type, unassigned).

### 2. Layout Extraction

Created `src/app/activity/layout.tsx` — a shared layout providing sidebar, header, and content wrapper for all Activity sub-pages. Keeps the shell consistent as new views are added later.

### 3. Page Simplification

Rewrote `src/app/activity/page.tsx` from 1,753 lines down to ~550 lines. Removed:
- Overview tab (summary cards, stacked bar charts, weekly chart)
- Snapshots tab (raw window data table)
- Daily tab (aggregated daily table)
- CC Usage tab
- All tab navigation
- Summary bar with activity type badges

Kept only the Timeline (Unified Activity Log) table with all filters compressed into a single line using compact button labels (1D/7D/30D/All) and smaller select triggers.

### 4. Automatic Rematch

Moved rematch logic from a manual POST endpoint (`/api/db/activity`) into `runWindowIngest()` in `src/lib/activity.ts`. Now every time the Activity page loads:
1. Daemon auto-installs
2. New window data is ingested
3. Previously unmatched snapshots are automatically retried against the current project list

Extracted the rematch logic into a reusable `rematchUnmatched()` function in `activity.ts`. Removed the POST handler from the activity API route entirely.

## Files Modified

- `src/hooks/use-activity-filters.ts` - New: URL search param-based universal filter hook
- `src/app/activity/layout.tsx` - New: shared Activity layout (sidebar + header)
- `src/app/activity/page.tsx` - Rewritten: Timeline-only view with single-line combined filters
- `src/lib/activity.ts` - Added `rematchUnmatched()` function, integrated into `runWindowIngest()`
- `src/app/api/db/activity/route.ts` - Removed POST handler and unused imports
- `src/components/app-sidebar.tsx` - Renamed "Dashboard" to "Timeline" in Activity nav

## Key Takeaways

- URL search params are the right pattern for universal filters — no context provider needed, works across sub-pages, survives refresh
- The rematch step runs on every page load as part of ingestion — zero manual intervention needed
- The Activity section is now set up as a clean foundation for adding new views/charts later, each of which just calls `useActivityFilters()` to get the shared filter state
- All old visualizations were intentionally removed — they'll be rebuilt thoughtfully rather than carried forward
