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
  type DbProject,
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

// Meeting apps get split into contiguous time blocks (≈ one meeting each) so they line up
// with individual calendar events, instead of lumping a whole day's calls into one cluster.
function isMeetingApp(app: string, host: string): boolean {
  const a = (app || "").toLowerCase();
  return a.includes("zoom") || a.includes("granola") || (host || "").includes("meet.google.com");
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

  const groups = new Map<string, DbSnapshot[]>();
  for (const s of unmatched) {
    const day = toLocalDateString(s.timestamp);
    const host = urlHostOf(s.url);
    const key = clusterKeyOf(day, s.app, host);
    const arr = groups.get(key);
    if (arr) arr.push(s); else groups.set(key, [s]);
  }

  let written = 0;
  let skipped = 0;
  for (const [key, groupSnaps] of groups) {
    const app = groupSnaps[0].app;
    const host = urlHostOf(groupSnaps[0].url);
    // Meeting apps → split into contiguous blocks (≈ one meeting); everything else → one cluster.
    const blocks = isMeetingApp(app, host) ? splitContiguous(groupSnaps, 15) : [groupSnaps];

    for (const snaps of blocks) {
      const clusterMinutes = snaps.reduce((sum, s) => sum + (s.durationSeconds ?? 10), 0) / 60;
      if (clusterMinutes < minMinutes) { skipped++; continue; }
      written++;
      const startTs = Math.min(...snaps.map((s) => s.timestamp));
      const endTs = Math.max(...snaps.map((s) => s.timestamp));
      const clusterKey = blocks.length > 1 ? `${key}::b${startTs}` : key;
      assignmentQueue.upsertPending({
        clusterKey,
        day: toLocalDateString(snaps[0].timestamp),
        app,
        urlHost: host,
        sampleTitle: mostFrequent(snaps.map((s) => normalizeTitle(s.windowTitle))),
        sampleUrl: mostFrequent(snaps.map((s) => s.url || "")),
        snapshotIds: snaps.map((s) => s.id!).filter((id): id is number => typeof id === "number"),
        startTs,
        endTs,
        minutes: clusterMinutes,
      });
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

  const items = clusters.map((c) => ({
    id: c.id,
    day: c.day,
    app: c.app,
    urlHost: c.urlHost,
    sampleTitle: c.sampleTitle,
    sampleUrl: c.sampleUrl,
    minutes: Math.round(c.minutes * 10) / 10,
    timeRange: `${new Date(c.startTs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}–${new Date(c.endTs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
    projectBefore: neighborProject(c.day, c.startTs, "before"),
    projectAfter: neighborProject(c.day, c.endTs, "after"),
  }));

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
// Deterministic calendar meeting-matcher
// ──────────────────────────────────────────────

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Project match tokens (>=4 chars) from name/repo/aliases/slugs/prod+staging hosts. */
function projectTokens(p: DbProject): string[] {
  const out = new Set<string>();
  const add = (s: string | undefined) => { const t = norm(s || ""); if (t.length >= 4) out.add(t); };
  add(p.projectName); add(p.repoName); add(p.linearSlug); add(p.webflowSlug);
  for (const a of (p.aliases || "").split(",")) add(a);
  for (const u of [p.prodUrl, p.stagingUrl]) {
    if (!u) continue;
    const host = u.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
    add(host.split(".")[0]);
  }
  return [...out];
}

// Only calendar-match clusters that were time-split into per-meeting blocks (zoom/meet/granola).
// Slack huddles and hostless "meet sharing screen" clusters stay day-wide, so matching them by
// time overlap is unreliable — leave those to the LLM / review.
function isMeetingCluster(c: { app: string; urlHost: string }): boolean {
  return isMeetingApp(c.app, c.urlHost);
}

/**
 * For each pending meeting/Zoom/Meet/huddle cluster, find a calendar event overlapping its
 * time window whose title/attendees name exactly one project, and assign it. Auto-applies at
 * or above the approve threshold; otherwise leaves a high-signal suggestion for review.
 */
export function matchCalendarForPending(): { matched: number; applied: number; suggested: number } {
  const approve = getAutoApproveThreshold();
  // Consider unresolved meeting clusters (pending OR already suggested — a calendar hit upgrades them).
  const clusters = [
    ...assignmentQueue.list({ status: "pending" }),
    ...assignmentQueue.list({ status: "suggested" }),
  ];
  const projects = projectsDb.list();
  const toks = projects.map((p) => ({ p, tokens: projectTokens(p) }));

  let matched = 0, applied = 0, suggested = 0;
  for (const c of clusters) {
    if (!isMeetingCluster(c)) continue;
    const events = calendarEvents.listOverlapping(c.startTs, c.endTs);
    if (events.length === 0) continue;

    // Collect every project named across overlapping events. Assign only if exactly one —
    // the cluster window is coarse (a day's meetings lumped), so ambiguity → leave for review.
    const named = new Map<string, { name: string; title: string }>();
    for (const ev of events) {
      const hay = norm(`${ev.title} ${ev.attendees}`);
      for (const t of toks) {
        if (t.tokens.some((tk) => hay.includes(tk))) named.set(t.p.id, { name: t.p.projectName, title: ev.title });
      }
    }
    if (named.size !== 1) continue;
    const [projectId, info] = [...named.entries()][0];

    matched++;
    const conf = 0.9;
    const reason = `calendar: "${info.title}"`;
    if (conf >= approve) {
      applyCluster(c.id, projectId);
      assignmentQueue.setSuggestion(c.id, projectId, conf, reason, "applied");
      applied++;
    } else {
      assignmentQueue.setSuggestion(c.id, projectId, conf, reason, "suggested");
      suggested++;
    }
  }
  return { matched, applied, suggested };
}
