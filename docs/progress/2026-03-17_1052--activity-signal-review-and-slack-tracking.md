# Activity Signal Review & Org-Level Slack Tracking

**Date:** 2026-03-17
**Type:** Decision + Build Log

## Context

With extensive activity tracking in place (window snapshots, CC transcript parsing), we reviewed which signals are actually useful for understanding project time allocation. The core question: what should we measure, and what's noise?

## Signal Assessment (Decision)

### Weak: Terminal/editor window snapshots
- A 10-second poll showing "terminal is in foreground" doesn't mean active work. Claude Code could be running autonomously while the user is away.
- Misses thinking time, context switching, and work done without the terminal focused.
- `codingMinutes` in `activityDaily` is really just "terminal was visible" — a poor proxy for effort.

### Strong: CC transcripts
- Already parsed: `claudeMinutes` (wall-clock time per Claude work turn), message counts, token usage, session counts.
- Directly measures coding effort — number of prompts, Claude working time, tokens consumed.
- Considered adding "user engagement time" (gap between Claude finishing and next prompt) but rejected — the user typically switches to another project between prompts, so this gap is idle time, not engagement.

### Strong: Browser snapshots (localhost/staging/prod)
- Reliable signal for testing/reviewing. Matches on port and URL.
- 10-second sampling is good enough — not worth over-engineering with Chrome extensions or dev server middleware.

### Strong (newly built): Slack time by org
- Slack window titles reliably expose workspace and channel: `"channel-name (Channel) - Workspace - Slack"`
- Maps directly to orgs: Minima and Super Green are the two featured workspaces.
- Covers PM/communication time that was previously lost as "other."

### Conclusion
The three pillars of project time: **CC transcripts** (coding), **browser snapshots** (testing), **Slack/Linear** (PM/comms). Terminal window snapshots remain but are recognized as a rough secondary signal.

## What Changed (Build)

### New: Org-level Slack tracking
- Slack time now always rolls up to the org level, even when it also matches a specific project.
- Workspace-to-org mapping: `"Minima" -> "minimagroup"`, `"Super Green" -> "Super-Green"`.

### New table: `orgSlackDaily`
- Schema: `(date, org, workspace, channel, channelType, minutes)` with unique constraint on `(date, org, workspace, channel)`.
- Tracks per-channel, per-workspace Slack time daily.

### Updated: `activityDaily` gains `slackMinutes`
- Project-matched Slack time recorded separately from "other" activity.

### Updated: Slack matching returns structured data
- `matchSlack()` now returns `activityType: "slack"` (was "other") with a `slackInfo` object containing parsed channel, channelType, workspace, and org.
- Unmatched Slack with a known workspace returns a result with empty `projectId` so ingestion routes it to `orgSlackDaily`.

### New: `parseSlackTitle()` utility
- Parses `"channel-name (Channel) - Workspace - Slack"` format into structured `SlackTitleInfo`.

## Files Modified

- `src/lib/db.ts` — Added `orgSlackDaily` table + CRUD, `slackMinutes` column migration on `activityDaily`, updated `DbActivityDaily` interface and upsert
- `src/lib/activity.ts` — Added `SLACK_WORKSPACE_ORG_MAP`, `parseSlackTitle()`, `SlackTitleInfo` interface, updated `MatchResult` with `slackInfo` and `"slack"` activity type, updated `matchSlack()` with org fallback, updated `runWindowIngest()` to route Slack to both project and org aggregations
- `src/app/api/db/activity/route.ts` — Updated rematch handler for Slack routing to both `activityDaily` and `orgSlackDaily`
- `src/app/api/db/org-slack/route.ts` — New API route for querying org Slack data (GET with filters, POST clear)

## Key Takeaways

- Terminal "coding minutes" from window snapshots is a weak signal — CC transcripts are the real measure of coding effort
- Slack time should always roll up to the org, even when also attributed to a project — dual recording
- 127 existing Slack snapshots in the DB (121 unmatched) will be backfilled on next rematch
- The workspace-to-org mapping is hardcoded for now (`SLACK_WORKSPACE_ORG_MAP`) — could move to settings if more workspaces are added
- "User engagement time" between Claude responses was considered and rejected — user switches projects between prompts, so the gap is not meaningful engagement time
