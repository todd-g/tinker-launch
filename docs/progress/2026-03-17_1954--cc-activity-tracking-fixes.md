# CC Activity Tracking: Dedup, isRealHuman, and Session Stats Fixes

**Date:** 2026-03-17
**Type:** Build Log

## Context

The timeline view was showing 18h 38m for the Indoma project on a normal workday. Investigation revealed two compounding bugs in the Claude Code transcript ingestion pipeline: massive row duplication in `activitySnapshots`, and additive `ccUsageDaily` upserts that inflated every re-parse. We also found the `isRealHuman` detection logic was using fragile content-sniffing instead of the explicit envelope fields the transcript format provides.

## What Changed

### Bug 1: Duplicate CC turns in `activitySnapshots`
CC transcript sessions were being re-parsed every time the session file grew (active sessions change size). With no unique constraint, each re-parse inserted duplicate rows. One session (`f7ff094a`) had turns inserted 27x over, contributing 18+ hours of phantom time.

**Fix:**
- Added `UNIQUE INDEX idx_snapshots_cc_dedup ON activitySnapshots(ccSessionId, timestamp) WHERE source = 'cc_transcript'`
- Changed `insertBatch` in `src/lib/db.ts` to use `INSERT OR IGNORE`
- Deleted 1,151 existing duplicate rows from the DB

### Bug 2: Additive `ccUsageDaily` upserts
The daily totals used `ON CONFLICT DO UPDATE SET x = x + excluded.x` — so every re-parse of a session added its stats again on top. Result: `userMessageCount: 11,542` and `totalClaudeMinutes: 1,901` for a single day (should be ~59 messages, ~109 min).

**Fix:**
- Added new `ccSessionStats` table (`src/lib/db.ts`) with `sessionId TEXT PRIMARY KEY` — one row per session, INSERT OR REPLACE is safe
- `ccUsageDaily` is now rebuilt by aggregating from `ccSessionStats` via `rebuildFromSessions()` — always a derived value, never additive
- Parser (`src/lib/activity.ts`) now writes per-session stats then rebuilds daily totals for affected (projectId, date) pairs

### Bug 3: Fragile `isRealHuman` detection
Old logic: "if every content block is `tool_result`, it's automatic." This missed mixed messages and was guessing from content instead of using envelope fields.

**Fix:** The transcript format has explicit fields:
- `sourceToolAssistantUUID` — present on all automatic tool result messages (triggered by assistant tool calls)
- `isCompactSummary` / `isVisibleInTranscriptOnly` — context continuation injections

New logic in `parseCCSessionFile`:
```ts
const isRealHuman = !obj.sourceToolAssistantUUID
  && !obj.isCompactSummary
  && !obj.isVisibleInTranscriptOnly;
```
`isMeta` messages (slash commands like `/plan`) are correctly counted as real human turns.

### `humanMessageCount` fix
`stats.userMessageCount` was incrementing for all user messages including tool results. Renamed to `humanMessageCount` and now only increments for `isRealHuman === true` messages. Stored in `ccSessionStats.humanMessageCount` and reflected in `ccUsageDaily.userMessageCount`.

### Force re-parse
Triggered via `GET /api/db/cc-usage?force=1` — clears `ccUsageDaily`, `ccSessionStats`, and all `cc_transcript` rows from `activitySnapshots`, then rebuilds from scratch.

**Before:** Indoma today — 614 turns, 1,901 claudeMinutes, 11,542 userMessages
**After:** Indoma today — 43 turns, 109 claudeMinutes, 59 humanMessages ✓

## Files Modified

- `src/lib/db.ts` — Added `ccSessionStats` table + module; rewrote `ccUsageDaily.upsert` → `rebuildFromSessions()`; `INSERT OR IGNORE` in `insertBatch`; unique index for CC dedup
- `src/lib/activity.ts` — Fixed `isRealHuman` detection; `humanMessageCount` rename; parser now writes `ccSessionStats` and calls `rebuildFromSessions`; `CCSessionStats` interface updated

## Key Takeaways

- `sourceToolAssistantUUID` is the definitive field for "this is an automatic tool result, not a human message" — no content sniffing needed
- Any daily aggregation table that can be re-derived should use SET (not +=) on conflict, or be rebuilt from a per-entity source table
- The unique index pattern (`INSERT OR IGNORE` + partial unique index on `ccSessionId, timestamp WHERE source = 'cc_transcript'`) is the right guard for idempotent ingestion of append-only transcript files
- `claudeMinutes` (lastAssistantTs - userTs per turn) is a sound measure of Claude working time — validated against a real session showing avg 2.5 min/turn, max 10.6 min for complex tasks
- Window tracker totals and CC turn totals are additive and both belong in the timeline — they measure different things (measured window focus vs estimated user engagement) but both represent real time spent on a project
