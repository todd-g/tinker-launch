// ──────────────────────────────────────────────
// Unassigned-activity suggestion engine (deterministic parts).
//
// The app owns clustering + the queue + applying assignments. The "guessing" is a
// thin, swappable step (a Claude Code skill, or Gemini later) that reads
// GET /api/suggest/pending and writes guesses back via POST /api/suggest/classify.
// ──────────────────────────────────────────────

import {
  getDb,
  activitySnapshots,
  activityDaily,
  projects as projectsDb,
  assignmentQueue,
  calendarEvents,
  settings,
  type DbSnapshot,
} from "@/lib/db";

function toLocalDateString(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function urlHostOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || "";
  }
}

/** Strip app/browser suffixes so titles cluster and read cleanly. */
function normalizeTitle(title: string | undefined): string {
  if (!title) return "";
  return title
    .replace(/\s*[-–—|]\s*(Google Chrome|Brave|Safari|Arc|Microsoft Edge|Slack|Zoom).*$/i, "")
    .trim();
}

function clusterKeyOf(day: string, app: string, host: string): string {
  return host ? `${day}::${app}::h:${host}` : `${day}::${app}::app`;
}

// A snapshot that represents being IN a meeting — Zoom, Google Meet, or a Slack huddle.
// (Granola is excluded on purpose: it only observes meetings, it doesn't host them.)
// These share one flow; meeting clusters are time-split per meeting so each pairs with a
// single overlapping calendar event, then the LLM decides the project.
function meetingLabel(s: DbSnapshot): string | null {
  const a = (s.app || "").toLowerCase();
  const host = urlHostOf(s.url).toLowerCase();
  const title = (s.windowTitle || "").toLowerCase();
  if (a.includes("zoom")) return "zoom";
  if (host.includes("meet.google.com")) return "meet";
  if (a.includes("slack") && title.includes("huddle")) return "huddle";
  return null;
}

/** A queued cluster that represents a meeting (gets paired with overlapping calendar events). */
function isMeetingClusterRow(c: { app: string; urlHost: string; sampleTitle: string }): boolean {
  const a = (c.app || "").toLowerCase();
  const host = (c.urlHost || "").toLowerCase();
  const title = (c.sampleTitle || "").toLowerCase();
  return a.includes("zoom") || host.includes("meet.google.com")
    || (a.includes("slack") && title.includes("huddle"));
}

function pushTo(map: Map<string, DbSnapshot[]>, key: string, s: DbSnapshot): void {
  const arr = map.get(key);
  if (arr) arr.push(s); else map.set(key, [s]);
}

function splitContiguous(snaps: DbSnapshot[], gapMinutes: number): DbSnapshot[][] {
  const sorted = [...snaps].sort((a, b) => a.timestamp - b.timestamp);
  const gapMs = gapMinutes * 60_000;
  const blocks: DbSnapshot[][] = [];
  let cur: DbSnapshot[] = [];
  for (const s of sorted) {
    if (cur.length && s.timestamp - cur[cur.length - 1].timestamp > gapMs) { blocks.push(cur); cur = []; }
    cur.push(s);
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

/** Most frequent non-empty value in a list (ties → first seen). */
function mostFrequent(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = "";
  let bestN = 0;
  for (const [v, n] of counts) if (n > bestN) { best = v; bestN = n; }
  return best;
}

// ──────────────────────────────────────────────
// Build / refresh the queue from current unassigned reportable snapshots
// ──────────────────────────────────────────────

export function buildQueue(opts?: { startDate?: string; endDate?: string; minMinutes?: number }): { clusters: number; snapshots: number; skipped: number } {
  // Refresh: drop old pending rows so the queue reflects the current window.
  assignmentQueue.clearPending();

  const minMinutes = opts?.minMinutes ?? 2;
  const unmatched = activitySnapshots.list({
    unassigned: true,
    reportable: true,
    startDate: opts?.startDate,
    endDate: opts?.endDate,
  });

  // Meetings cluster by (day, meeting-type) then time-split; everything else by (day, app, host).
  const meetingGroups = new Map<string, DbSnapshot[]>();
  const regularGroups = new Map<string, DbSnapshot[]>();
  for (const s of unmatched) {
    const day = toLocalDateString(s.timestamp);
    const label = meetingLabel(s);
    if (label) pushTo(meetingGroups, `${day}::${label}`, s);
    else pushTo(regularGroups, clusterKeyOf(day, s.app, urlHostOf(s.url)), s);
  }

  let written = 0;
  let skipped = 0;
  const writeCluster = (clusterKey: string, snaps: DbSnapshot[]) => {
    const clusterMinutes = snaps.reduce((sum, s) => sum + (s.durationSeconds ?? 10), 0) / 60;
    if (clusterMinutes < minMinutes) { skipped++; return; }
    written++;
    const startTs = Math.min(...snaps.map((s) => s.timestamp));
    const endTs = Math.max(...snaps.map((s) => s.timestamp));
    assignmentQueue.upsertPending({
      clusterKey,
      day: toLocalDateString(snaps[0].timestamp),
      app: snaps[0].app,
      urlHost: urlHostOf(snaps[0].url),
      sampleTitle: mostFrequent(snaps.map((s) => normalizeTitle(s.windowTitle))),
      sampleUrl: mostFrequent(snaps.map((s) => s.url || "")),
      snapshotIds: snaps.map((s) => s.id!).filter((id): id is number => typeof id === "number"),
      startTs,
      endTs,
      minutes: clusterMinutes,
    });
  };

  for (const [key, snaps] of regularGroups) writeCluster(key, snaps);
  for (const [key, snaps] of meetingGroups) {
    for (const block of splitContiguous(snaps, 15)) {
      writeCluster(`${key}::b${Math.min(...block.map((s) => s.timestamp))}`, block);
    }
  }

  return { clusters: written, snapshots: unmatched.length, skipped };
}

// ──────────────────────────────────────────────
// Payload for the classifier (clusters + projects + neighbor hints)
// ──────────────────────────────────────────────

function neighborProject(day: string, ts: number, dir: "before" | "after"): string | null {
  const db = getDb();
  const cmp = dir === "before" ? "<" : ">";
  const order = dir === "before" ? "DESC" : "ASC";
  const row = db.prepare(
    `SELECT projectName FROM activitySnapshots
     WHERE projectId IS NOT NULL AND projectId != ''
       AND date(timestamp/1000,'unixepoch','localtime') = ?
       AND timestamp ${cmp} ?
     ORDER BY timestamp ${order} LIMIT 1`
  ).get(day, ts) as { projectName: string } | undefined;
  return row?.projectName || null;
}

export function pendingPayload() {
  const clusters = assignmentQueue.list({ status: "pending" });
  const allProjects = projectsDb.list();

  const projects = allProjects.map((p) => ({
    id: p.id,
    name: p.projectName,
    repo: p.repoName,
    aliases: p.aliases,
    org: p.org,
    prodUrl: p.prodUrl,
    stagingUrl: p.stagingUrl,
    linearSlug: p.linearSlug,
    webflowSlug: p.webflowSlug,
  }));

  const hm = (ts: number) => new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const items = clusters.map((c) => {
    const meeting = isMeetingClusterRow(c);
    // For meetings, hand the LLM the overlapping calendar events — it decides if a project is clear.
    const events = meeting
      ? calendarEvents.listOverlapping(c.startTs, c.endTs).map((e) => ({
          title: e.title,
          attendees: e.attendees,
          timeRange: `${hm(e.startTs)}–${hm(e.endTs)}`,
        }))
      : [];
    return {
      id: c.id,
      day: c.day,
      app: c.app,
      urlHost: c.urlHost,
      sampleTitle: c.sampleTitle,
      sampleUrl: c.sampleUrl,
      minutes: Math.round(c.minutes * 10) / 10,
      timeRange: `${hm(c.startTs)}–${hm(c.endTs)}`,
      projectBefore: neighborProject(c.day, c.startTs, "before"),
      projectAfter: neighborProject(c.day, c.endTs, "after"),
      meeting,
      calendarEvents: events,
    };
  });

  return { clusters: items, projects };
}

// ──────────────────────────────────────────────
// Apply a cluster: assign its snapshots to a project + roll into activityDaily
// ──────────────────────────────────────────────

export function applyCluster(id: number, projectId: string): { assigned: number; projectName: string } {
  const cluster = assignmentQueue.get(id);
  if (!cluster) throw new Error(`cluster ${id} not found`);
  if (cluster.status === "applied") return { assigned: 0, projectName: "" };

  const project = projectsDb.get(projectId);
  if (!project) throw new Error(`project ${projectId} not found`);

  const ids: number[] = JSON.parse(cluster.snapshotIds);
  const snaps = activitySnapshots.getByIds(ids);

  activitySnapshots.assignMany(ids, projectId, project.projectName);

  // Roll the newly-assigned minutes into activityDaily (adds; mirrors window ingest buckets).
  const MIN = (s: DbSnapshot) => (s.durationSeconds ?? 10) / 60;
  const agg: Record<string, ReturnType<typeof emptyDaily>> = {};
  for (const s of snaps) {
    const date = toLocalDateString(s.timestamp);
    if (!agg[date]) agg[date] = emptyDaily(projectId, date);
    const a = agg[date];
    a.totalMinutes += MIN(s);
    switch (s.activityType) {
      case "coding": a.codingMinutes += MIN(s); break;
      case "browser_local": a.browserLocalMinutes += MIN(s); break;
      case "browser_staging": a.browserStagingMinutes += MIN(s); break;
      case "browser_prod": a.browserProdMinutes += MIN(s); break;
      case "browser_webflow": a.browserWebflowMinutes += MIN(s); break;
      case "xcode": a.xcodeMinutes += MIN(s); break;
      case "slack": a.slackMinutes += MIN(s); break;
    }
  }
  for (const a of Object.values(agg)) activityDaily.upsert(a);

  assignmentQueue.setStatus(id, "applied");
  return { assigned: ids.length, projectName: project.projectName };
}

function emptyDaily(projectId: string, date: string) {
  return {
    projectId, date,
    codingMinutes: 0, browserLocalMinutes: 0, browserStagingMinutes: 0,
    browserProdMinutes: 0, browserWebflowMinutes: 0, xcodeMinutes: 0,
    slackMinutes: 0, totalMinutes: 0,
  };
}

// ──────────────────────────────────────────────
// Settings
// ──────────────────────────────────────────────

const APPROVE_KEY = "assignAutoApproveThreshold";
const REJECT_KEY = "assignAutoRejectThreshold";

export function getAutoApproveThreshold(): number {
  const v = settings.get(APPROVE_KEY);
  return typeof v === "number" && v >= 0 && v <= 1 ? v : 0.9;
}

export function setAutoApproveThreshold(v: number): void {
  settings.set(APPROVE_KEY, Math.max(0, Math.min(1, v)));
}

export function getAutoRejectThreshold(): number {
  const v = settings.get(REJECT_KEY);
  // 1.0 default = never auto-reject until the user opts in.
  return typeof v === "number" && v >= 0 && v <= 1 ? v : 1.0;
}

export function setAutoRejectThreshold(v: number): void {
  settings.set(REJECT_KEY, Math.max(0, Math.min(1, v)));
}

// ──────────────────────────────────────────────
// Calendar source settings
//
// All calendar→project decisions are made by the LLM (the deterministic token matcher was too
// rough). The app only pairs meeting clusters with overlapping events (see pendingPayload) and
// tracks which calendars to sync + the available list (populated by the classify skill).
// ──────────────────────────────────────────────

const CAL_SYNC_KEY = "calendarSyncIds";
const CAL_AVAIL_KEY = "calendarAvailable";

export interface CalendarRef { id: string; summary: string }

export function getCalendarSyncIds(): string[] {
  const v = settings.get(CAL_SYNC_KEY);
  return Array.isArray(v) ? (v as string[]) : [];
}

export function setCalendarSyncIds(ids: string[]): void {
  settings.set(CAL_SYNC_KEY, ids.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()));
}

export function getCalendarAvailable(): CalendarRef[] {
  const v = settings.get(CAL_AVAIL_KEY);
  return Array.isArray(v) ? (v as CalendarRef[]) : [];
}

export function setCalendarAvailable(cals: CalendarRef[]): void {
  settings.set(CAL_AVAIL_KEY, cals);
}
