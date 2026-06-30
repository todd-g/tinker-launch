---
name: classify-unassigned
description: Classify unassigned Tinker Launch activity clusters to projects with confidence scores. Use when the user asks to "classify unassigned time", "assign unmatched activity", "guess projects for the queue", "run the assigner/suggester", or when running the nightly activity-assignment pass. Pulls calendar events, reads the queue from the local dashboard API, and writes back guesses; the app auto-applies high-confidence project matches, auto-rejects high-confidence personal/non-project time, and queues the rest for review.
---

# Classify unassigned activity

You are the classification engine for Tinker Launch's activity assigner. The app clusters
unassigned activity into a queue and deterministically matches meetings to projects from
calendar events. Your job: feed it calendar events, then guess projects for whatever's left,
with an honest confidence in each verdict. The app decides auto-apply vs auto-reject vs review.

Dashboard runs locally on **http://localhost:3001** (port 3001 is reserved for it).

## Steps

1. **Ingest calendar events** (so the app can auto-match Zoom/Meet/huddle blocks). If a Google
   Calendar connector is available, list events for the last ~10 days from the user's work
   calendars (primary `todd@minima.nyc`, plus `todd@super.green`, `admin@pollinator.coop`).
   Normalize each to ms timestamps and POST:
   ```bash
   curl -s -X POST http://localhost:3001/api/calendar/ingest -H 'Content-Type: application/json' \
     -d '{"events":[{"id":"<calId>::<eventId>","calendarId":"todd@minima.nyc","title":"Prudentia sync","startTs":1750000000000,"endTs":1750003600000,"attendees":"matt@minima.nyc"}]}'
   ```
   Skip this step silently if no calendar connector is connected.

2. **Refresh the queue** (clusters new unassigned activity AND runs the deterministic calendar
   matcher over meeting clusters):
   ```bash
   curl -s -X POST "http://localhost:3001/api/suggest/run?days=7&minMinutes=3"
   ```
   The response includes `clusters`, and `calendar:{matched,applied,suggested}` for meetings.

3. **Fetch what's still pending** (non-meeting clusters, or meetings calendar couldn't place):
   ```bash
   curl -s http://localhost:3001/api/suggest/pending
   ```
   - `clusters[]`: `{ id, day, app, urlHost, sampleTitle, sampleUrl, minutes, timeRange, projectBefore, projectAfter }`
   - `projects[]`: `{ id, name, repo, aliases, org, prodUrl, stagingUrl, linearSlug, webflowSlug }`

4. **Classify each cluster — return a VERDICT, not just a guess.** For each, set `projectId`,
   a `confidence` in `[0,1]` *in that verdict*, and a one-line `reason`:
   - **It IS a project** → set `projectId`. Signals: `urlHost`/`sampleUrl` contains a project's
     slug/`repo`/`aliases`/`prodUrl`/`stagingUrl` (e.g. `prudentia-staging.vercel.app` → Prudentia);
     `sampleTitle` names a project; both `projectBefore`/`projectAfter` are the same project. High
     confidence (≥0.9) → the app auto-applies.
   - **It is NOT a project (personal/idle)** → set `projectId: null`. Personal browsing (YouTube,
     Netflix, Amazon, personal Gmail, Maps, shopping), idle, generic noise. High confidence here
     (≥ the auto-reject threshold) → the app auto-rejects it (won't clutter the inbox or recur).
   - **Unsure** → projectId `null` (or a tentative project) with mid/low confidence → goes to review.

   Be honest: `confidence` is how sure you are of the verdict. Over-confident project guesses cause
   wrong auto-assignments; over-confident "personal" causes wrong auto-rejects. When genuinely
   torn, keep confidence moderate so it lands in review.

5. **Post the verdicts**, batched (~8 per request):
   ```bash
   curl -s -X POST http://localhost:3001/api/suggest/classify -H 'Content-Type: application/json' \
     -d '{"classifications":[{"id":12,"projectId":"<projectId>","confidence":0.95,"reason":"staging url matches prudentia"},{"id":13,"projectId":null,"confidence":0.95,"reason":"personal YouTube"},{"id":14,"projectId":null,"confidence":0.4,"reason":"Zoom with no calendar match — needs review"}]}'
   ```
   Response: `{ applied, rejected, suggested, skipped, approveThreshold, rejectThreshold }`.

6. **Report a summary**: auto-applied (which projects), auto-rejected (how much personal time),
   left for review at `/activity/assign`, and any meetings calendar couldn't place.

## Notes
- Run this locally — it needs the local DB (via the API) and, for calendar, a connected Google
  Calendar connector. A *cloud* schedule can't reach the local dashboard.
- Nightly: a local launchd/cron job running `claude -p "/classify-unassigned"` (mirrors the
  window-tracker LaunchAgent). Not a cloud routine.
- Thresholds (auto-approve / auto-reject) are set by the user on `/activity/assign`; just report
  honest confidence and let the app apply the policy.
