# SQLite Migration & Activity Tracking System

**Date:** 2026-03-16
**Type:** Build Log

## Context

Tinker Launch previously used Convex (cloud DB) for all data storage. While building a new activity tracking feature (window focus tracking, Claude Code transcript parsing), the volume of local-only data made paying for Convex usage unnecessary — this is a tool that only runs locally. The entire app was migrated to SQLite, and a passive activity tracking system was built from scratch.

## What Changed

### 1. Full Convex → SQLite Migration

Replaced Convex with a local SQLite database at `~/.tinker-launch/tinker.db`. This touched every data-reading component in the app.

**New core module: `src/lib/db.ts`**
- SQLite via `better-sqlite3` with WAL mode and foreign keys
- Singleton pattern with lazy initialization
- Exports: `projects`, `settings`, `activitySnapshots`, `activityDaily`, `ccUsageDaily`
- Each export has full CRUD methods (list, get, create, update, remove, upsert)
- `activityDaily.upsert()` and `ccUsageDaily.upsert()` use `ON CONFLICT DO UPDATE SET col = col + excluded.col` for additive aggregation

**New React hooks: `src/hooks/use-db.ts`**
- `useDbQuery<T>(url, params?)` — fetch-based query with auto-refetch on param change
- `useDbMutation(url)` — returns `{ mutate, loading }` for POST operations
- These replace all Convex `useQuery`/`useMutation` hooks

**New API routes:**
- `src/app/api/db/projects/route.ts` — project CRUD (list, get, create, updateStatus, updateOrg, remove, nextPort)
- `src/app/api/db/settings/route.ts` — key/value settings
- `src/app/api/db/activity/route.ts` — activity daily data (auto-ingests on each request)
- `src/app/api/db/cc-usage/route.ts` — CC usage data (auto-parses on each request)

**Migrated pages:**
- `src/app/layout.tsx` — removed ConvexClientProvider wrapper
- `src/app/ports/page.tsx` — useDbQuery/useDbMutation, `project.id` instead of `project._id`
- `src/app/new/page.tsx` — fetch-based project creation and port lookup
- `src/app/settings/page.tsx` — fetch-based settings
- `src/app/settings/import/page.tsx` — fetch-based import flow
- `src/app/settings/credentials/page.tsx` — fetch-based credentials
- `src/components/project-list.tsx` — useDbQuery, `project.id`
- `src/types/project.ts` — `_id` → `id`

**Removed dead code:**
- `convex/` directory (schema, functions, generated types)
- `src/components/convex-provider.tsx`
- `convex` npm package from dependencies
- `.env.local` Convex vars (`NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT`)

**Data migration:**
- All 28 projects pulled from Convex API (`trustworthy-cricket-962.convex.cloud`) and inserted into SQLite
- Convex deployment still exists but is no longer used
- Credentials were already in `~/.tinker-launch/credentials.yaml` (unaffected)

### 2. Activity Tracking System

**Window focus daemon: `scripts/window-tracker.sh`**
- Pure bash script using `osascript` to poll frontmost app every 10 seconds
- Filters Chrome/Brave/Arc Incognito/Private windows
- Writes JSONL to `~/.tinker-launch/activity/window-focus.jsonl`
- Installed as macOS LaunchAgent (`com.tinker-launch.window-tracker`)
- Script copied to `~/.tinker-launch/bin/` at install time (macOS blocks `launchd` from reading `~/Documents`)
- Auto-installs on first visit to Activity page

**Window-to-project matching: `src/lib/activity.ts`**
- `matchWindowToProject()` maps window context to projects via:
  - Terminal apps: parse directory from window title → match `localPath`
  - VS Code/Cursor: match folder name from title
  - Browser `localhost:PORT`: match port → project
  - Xcode: parse project name from title
- Classifies activity as: coding, browser_local, browser_staging, browser_prod, xcode

**Ingestion: `runWindowIngest()` in `src/lib/activity.ts`**
- Reads JSONL, matches entries to projects, batch-inserts snapshots, upserts daily aggregations
- Each 10s snapshot = 10/60 minutes of attributed time
- Tracks state in `~/.tinker-launch/activity/last-ingest.json` to skip processed entries
- Truncates processed entries from JSONL file
- Runs automatically when activity data is requested (no manual trigger needed)

**CC transcript parsing: `runCCParse()` in `src/lib/activity.ts`**
- Scans `~/.claude/projects/*/` for `.jsonl` session files directly on disk
- Does NOT rely on `sessions-index.json` (files referenced there are often missing/purged)
- Matches Claude project dir names to registered projects via path encoding (`/Users/foo/bar` → `-Users-foo-bar`)
- Extracts token usage from `message.usage` (nested, not top-level)
- Tracks parsed sessions by file path + size to skip unchanged files
- Runs automatically when CC usage data is requested
- Found 831 sessions across 17 projects on first run

**Activity dashboard: `src/app/activity/page.tsx`**
- No manual buttons — everything runs automatically on page load
- Date range toggle: Today / Week / Month
- Per-project activity cards with stacked color bars (coding, browser types, Xcode)
- CC Usage table with sessions, messages, tokens (input/output/cache), duration, and totals row
- Weekly 7-day bar chart color-coded by project

**Sidebar update: `src/components/app-sidebar.tsx`**
- Added Activity nav item with Timer icon

### 3. Key Bug Fixes During Implementation

- **macOS LaunchAgent permissions**: `/usr/bin/python3` (Xcode shim) and scripts in `~/Documents` are blocked by macOS App Management. Fixed by: switching to bash, copying script to `~/.tinker-launch/bin/`
- **CC session file format**: `message.usage` not top-level `usage`; `sessions-index.json` references files that don't exist on disk → switched to direct `.jsonl` file scanning
- **Convex type mismatches**: String project IDs vs Convex branded `Id<"projects">` — resolved by migration to SQLite

## Files Modified

- `src/lib/db.ts` — NEW: Core SQLite database layer
- `src/lib/activity.ts` — NEW: Window matching, ingestion, CC parsing, daemon install
- `src/hooks/use-db.ts` — NEW: React hooks replacing Convex
- `src/app/activity/page.tsx` — NEW: Activity dashboard
- `src/app/api/db/projects/route.ts` — NEW: Project CRUD API
- `src/app/api/db/settings/route.ts` — NEW: Settings API
- `src/app/api/db/activity/route.ts` — NEW: Activity data API (auto-ingests)
- `src/app/api/db/cc-usage/route.ts` — NEW: CC usage API (auto-parses)
- `scripts/window-tracker.sh` — NEW: Window focus daemon (bash)
- `scripts/com.tinker-launch.window-tracker.plist` — NEW: LaunchAgent template
- `src/app/layout.tsx` — Removed ConvexClientProvider
- `src/app/ports/page.tsx` — Migrated to useDbQuery
- `src/app/new/page.tsx` — Migrated to fetch-based
- `src/app/settings/page.tsx` — Migrated to useDbQuery
- `src/app/settings/import/page.tsx` — Migrated to useDbQuery
- `src/app/settings/credentials/page.tsx` — Migrated to useDbQuery
- `src/components/project-list.tsx` — Migrated to useDbQuery
- `src/components/app-sidebar.tsx` — Added Activity nav
- `src/types/project.ts` — `_id` → `id`
- `package.json` — Removed `convex`, added `better-sqlite3`
- `.env.local` — Cleared Convex vars

## Key Takeaways

- **SQLite is the right call for local-only tools** — no network latency, no usage costs, simpler deployment. WAL mode handles concurrent reads well.
- **Convex data survives removal** — the cloud deployment still responds to API queries even after removing the npm package. This made data migration trivial.
- **macOS LaunchAgents can't read `~/Documents`** — App Management / Full Disk Access restrictions mean daemon scripts must be copied to an unrestricted path like `~/.tinker-launch/bin/`.
- **Claude Code session files are unreliable via index** — `sessions-index.json` references files that get purged. Scanning for `.jsonl` files directly on disk is more robust.
- **Auto-ingest on read is cleaner than manual sync** — embedding ingestion into the GET routes means the UI never needs sync buttons or daemon status displays.
- **Convex credential management stays** — the credentials system manages Convex deploy keys for OTHER projects that use Convex. This is scaffolding functionality, not Tinker Launch's own DB.
