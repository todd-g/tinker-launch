# Fix Soko Spec port drift + missing prod URL (and reclaim misattributed activity)

**Date:** 2026-06-24
**Type:** Build Log (data repair + bug diagnosis)

## Context

User suspected sokospec's production and local URLs weren't being tracked properly. Investigation confirmed it on three counts and surfaced a port collision with a dead scaffold project that was silently absorbing all of sokospec's local dev activity. This was a data-layer repair against the live SQLite DB (`~/.tinker-launch/tinker.db`), not a code change.

## What Changed

### Root cause (three problems, one collision)

1. **Wrong local port.** Registry had sokospec on `8021`; the project actually runs on `8022` (`next dev -p 8022` in its `package.json`). Nothing ever ran on 8021.
2. **Port collision with a dead scaffold.** Port `8022` was registered to `oloplayground` — an empty scaffold from May 14, never built (no `package.json`, only tinker boilerplate). Because the activity matcher in `src/lib/activity.ts` keys `localhost:PORT → project` (line ~206-218), **all 5,812 of sokospec's real dev snapshots were credited to oloplayground.**
3. **Empty prodUrl.** sokospec's `prodUrl` was blank, so **639 visits to `sokospec.vercel.app` were unmatched** (`activityType: other`). The prod matcher (line ~278) needs `prodUrl` set to attribute `browser_prod`.

### The fix (single atomic transaction, after a full DB backup)

- `projects`: sokospec `port 8021 → 8022`, `prodUrl → https://sokospec.vercel.app`.
- `projects`: oloplayground `port 8022 → 8031` (non-destructive — resolves the collision; the empty scaffold stays, just off 8022).
- `activitySnapshots`: reassigned 5,812 `localhost:8022` rows from oloplayground → sokospec (kept `activityType=browser_local`).
- `activitySnapshots`: recovered 639 unmatched `sokospec.vercel.app` rows → sokospec, `activityType=browser_prod`.
- `activityDaily`: moved oloplayground's per-date rows into sokospec, deleted oloplayground's rows, and added the recovered prod minutes (local-time bucketed to match the app's own date convention).

### Key implementation details

- **Date bucketing:** `activityDaily.date` is derived from `new Date(timestamp)` in **local time** (activity.ts line ~803), not UTC. Verified that SQLite `strftime('%Y-%m-%d', ts/1000.0, 'unixepoch', 'localtime')` reproduces stored dates exactly (diff 0.0 across all oloplayground rows on an EDT machine) before relying on it.
- **Minutes formula:** each window snapshot contributes a flat `10/60 min` (`MINUTES_PER_SNAPSHOT`) to both its type bucket and `totalMinutes`. So `minutes = matched_snapshot_count × 10/60`.
- **`org` left untouched.** On browser snapshots, `org` reflects the **Chrome profile that browsed** (sokospec's prod hits were a genuine mix of `minimagroup` + personal), *not* the project's org. The app's own `rematchUnmatched` never rewrites it (`updateMatch` only sets projectId/projectName/activityType), so neither did we — org-level browser rollups (`orgBrowserDaily`) stay correct.
- **Concurrency:** dev server was live on 3001 (WAL mode). Used `BEGIN IMMEDIATE` + 5s busy timeout; transaction is atomic so a concurrent ingest can't half-apply it.

### Verification (reconciles exactly)

- sokospec `activityDaily`: local **968.7** + prod **106.5** + existing coding **3.0** = **1078.2 total**.
- Both local and prod match `snapshot_count × 10/60` to the decimal.
- 0 snapshots left unmatched for `sokospec.vercel.app`; 0 snapshots/daily rows remaining on oloplayground.
- Port 8022 owned by sokospec alone.

## Files Modified

No source files changed. This was a data repair against `~/.tinker-launch/tinker.db`:
- `projects` — sokospec port + prodUrl; oloplayground port.
- `activitySnapshots` — 6,451 rows reattributed (5,812 local + 639 prod).
- `activityDaily` — sokospec daily totals rebuilt; oloplayground rows removed.
- Backup written to `~/.tinker-launch/tinker.backup_20260624_132954.db` (188M).

Reference code (read, not modified): `src/lib/activity.ts` (`matchWindowToProject`, `runWindowIngest`, `rematchUnmatched`), `src/lib/db.ts` (`projects`, `activityDaily`).

## Key Takeaways

- **Registry port can silently drift from a project's real `package.json` dev port.** When it does, `localhost:PORT` activity is misattributed (to whoever owns that port) or dropped (if no one does). Same bug found in `laudeslearning` (registry 3005, real 3008) and `opsworx` (registry 3005, real 3006) — flagged as a follow-up port-drift audit across all projects. Relates to the existing `src/lib/port-drift.ts` work (commit 9e72fef).
- **An empty scaffold squatting on a real project's port is the worst case** — it looks like a legitimate project, so misattributed time accrues to it instead of going unmatched (which is at least visible).
- **`activityDaily` buckets by local time; reconstructions must too.** Naive UTC bucketing shifts minutes into adjacent dates (totals still match, per-day doesn't).
- **Don't rewrite `org` on browser snapshots** during reattribution — it's the browsing profile, a separate dimension from project attribution.
- **Reusable repair recipe:** back up via `.backup`; fix the `projects` row first (so matching sees the new port/prodUrl); move misattributed snapshots by projectId; for unmatched URL traffic let `rematchUnmatched` handle it *or* reassign + add daily minutes with local-time bucketing; move/delete the stale project's `activityDaily` rows rather than recomputing from scratch.
