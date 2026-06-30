---
name: classify-unassigned
description: Classify unassigned Tinker Launch activity clusters to projects with confidence scores. Use when the user asks to "classify unassigned time", "assign unmatched activity", "guess projects for the queue", "run the assigner/suggester", or for the nightly activity-assignment pass. Syncs calendars, reads the queue from the local dashboard API, decides projects (incl. meetings via overlapping calendar events), and writes back guesses; the app auto-applies high-confidence project matches, auto-rejects high-confidence personal time, and queues the rest for review.
---

# Classify unassigned activity

You are the classification engine for Tinker Launch's activity assigner. The app clusters
unassigned activity (meetings are split into per-meeting blocks) and pairs each meeting block
with the calendar events that overlap it. **All calendar→project decisions are yours** — the app
does not guess from calendar; it just hands you the overlapping events. Reason over them.

Dashboard runs locally on **http://localhost:3001** (port 3001 is reserved for it).

## Steps

1. **Sync calendars** (needs a connected Google Calendar connector — skip silently if absent):
   - `list_calendars` → POST the list so the dashboard UI can show them:
     ```bash
     curl -s -X POST http://localhost:3001/api/calendar/settings -H 'Content-Type: application/json' \
       -d '{"available":[{"id":"todd@minima.nyc","summary":"todd@minima.nyc"},{"id":"todd@super.green","summary":"todd@super.green"}]}'
     ```
   - Read which calendars the user wants synced: `curl -s http://localhost:3001/api/calendar/settings` → `syncIds`.
     If `syncIds` is empty, default to the user's primary work calendar.
   - For each `syncId`, `list_events` for the last ~10 days, normalize start/end to **ms**, and ingest:
     ```bash
     curl -s -X POST http://localhost:3001/api/calendar/ingest -H 'Content-Type: application/json' \
       -d '{"events":[{"id":"<calId>::<eventId>","calendarId":"todd@minima.nyc","title":"Todd<>Sharon","startTs":1750000000000,"endTs":1750003600000,"attendees":"sharon@indoma.care"}]}'
     ```

2. **Refresh the queue** (clusters activity; time-splits meetings):
   ```bash
   curl -s -X POST "http://localhost:3001/api/suggest/run?days=7&minMinutes=3"
   ```

3. **Fetch pending clusters:** `curl -s http://localhost:3001/api/suggest/pending`
   - `clusters[]`: `{ id, day, app, urlHost, sampleTitle, sampleUrl, minutes, timeRange, projectBefore, projectAfter, meeting, calendarEvents }`
   - For `meeting:true` clusters, `calendarEvents[]` = `{ title, attendees, timeRange }` overlapping the block.
   - `projects[]`: `{ id, name, repo, aliases, org, prodUrl, stagingUrl, linearSlug, webflowSlug }`

4. **Classify each cluster — return a VERDICT** (`projectId` or `null`, a `confidence` in `[0,1]` *in the verdict*, and a one-line `reason`):
   - **Meeting cluster** (`meeting:true`): look at `calendarEvents`. *Was there a meeting, and is the project clear from it?*
     - One overlapping event whose title/attendees clearly map to a project (e.g. attendee `sharon@indoma.care` → Indoma, "Prudentia sync" → Prudentia) → that project, high confidence.
     - Event is generic ("Standup", "POL Hour"), external (a webinar), or attendees/title don't single out a project → low confidence / `null` → review.
     - No overlapping events → can't attribute from calendar; fall back to other signals or `null`/low.
     - Multiple events naming different projects → pick the best-supported one with moderate confidence, or `null` if genuinely split.
   - **Non-meeting cluster**: `urlHost`/`sampleUrl`/`sampleTitle` contains a project slug/repo/alias/prod/staging URL → that project; adjacency (`projectBefore`/`projectAfter` both the same) → medium.
   - **Personal / idle** (YouTube, Netflix, Amazon, personal Gmail, Maps, shopping): `projectId:null` with **high** confidence → auto-rejected.
   - Unsure → `null`/tentative with mid/low confidence → review.

5. **Post verdicts**, batched (~8/request):
   ```bash
   curl -s -X POST http://localhost:3001/api/suggest/classify -H 'Content-Type: application/json' \
     -d '{"classifications":[{"id":12,"projectId":"<id>","confidence":0.95,"reason":"calendar: Todd<>Sharon (sharon@indoma.care) → Indoma"},{"id":13,"projectId":null,"confidence":0.95,"reason":"personal YouTube"},{"id":14,"projectId":null,"confidence":0.4,"reason":"Zoom overlapping only \"Standup\" — project unclear"}]}'
   ```
   Response: `{ applied, rejected, suggested, skipped, approveThreshold, rejectThreshold }`.

6. **Report**: auto-applied (which projects, incl. meetings), auto-rejected, left for review at `/activity/assign`.

## Notes
- Run locally — needs the local DB (via the API) and the Google Calendar connector. A *cloud* schedule can't reach the local dashboard.
- Nightly: a local launchd/cron job running `claude -p "/classify-unassigned"`. Not a cloud routine.
- Thresholds (auto-approve / auto-reject) and which calendars sync are set by the user on `/activity/assign`; report honest confidence and let the app apply the policy.
