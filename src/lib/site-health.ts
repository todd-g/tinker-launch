import { projects, siteChecks, jobRuns, DbSiteCheck } from "@/lib/db";

// ──────────────────────────────────────────────
// Synthetic site health checks
//
// Probes each project's prodUrl from this machine, recording HTTP status,
// time-to-first-byte and total response time. Incidents are derived at
// read time from consecutive failing checks — no separate incident store.
// ──────────────────────────────────────────────

const JOB_NAME = "site_health_check";
const AUTO_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const CHECK_TIMEOUT_MS = 15000;
const RETENTION_DAYS = 90;

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

async function probeUrl(url: string): Promise<{
  status: number;
  ok: boolean;
  ttfbMs: number | null;
  totalMs: number | null;
  error: string;
}> {
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      headers: { "User-Agent": "TinkerLaunch-HealthCheck/1.0" },
    });
    const ttfbMs = performance.now() - t0;
    await res.arrayBuffer(); // drain body for full response time
    const totalMs = performance.now() - t0;
    return { status: res.status, ok: res.ok, ttfbMs, totalMs, error: "" };
  } catch (e) {
    const msg = e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : String(e);
    return { status: 0, ok: false, ttfbMs: null, totalMs: null, error: msg };
  }
}

export interface SiteCheckResult {
  sitesChecked: number;
  up: number;
  down: number;
}

/** Probe every non-archived project with a prodUrl and record the results. */
export async function runSiteChecks(): Promise<SiteCheckResult> {
  const runId = jobRuns.start(JOB_NAME);
  try {
    const targets = projects
      .list(undefined, { includeArchived: false })
      .filter((p) => p.prodUrl.trim() !== "")
      .map((p) => ({ projectSlug: p.repoName, org: p.org, url: normalizeUrl(p.prodUrl) }));

    const checkedAt = Date.now();
    const results = await Promise.all(
      targets.map(async (t) => {
        const probe = await probeUrl(t.url);
        return {
          projectSlug: t.projectSlug,
          org: t.org,
          url: t.url,
          checkedAt,
          status: probe.status,
          ok: probe.ok ? 1 : 0,
          ttfbMs: probe.ttfbMs,
          totalMs: probe.totalMs,
          error: probe.error,
        };
      })
    );

    siteChecks.insertBatch(results);
    siteChecks.deleteOlderThan(Date.now() - RETENTION_DAYS * 86400 * 1000);

    const up = results.filter((r) => r.ok).length;
    const summary: SiteCheckResult = {
      sitesChecked: results.length,
      up,
      down: results.length - up,
    };
    jobRuns.finish(runId, "success", {
      ...summary,
      failures: results.filter((r) => !r.ok).map((r) => `${r.projectSlug}: ${r.status || r.error}`),
    });
    return summary;
  } catch (error) {
    jobRuns.finish(runId, "error", String(error));
    throw error;
  }
}

/** Run checks if the last successful run is older than the throttle interval. */
export async function runSiteChecksIfStale(opts?: { force?: boolean }): Promise<SiteCheckResult | null> {
  const last = jobRuns.lastSuccess(JOB_NAME, "");
  const stale = !last || Date.now() - last.startedAt > AUTO_CHECK_INTERVAL_MS;
  if (!stale && !opts?.force) return null;
  try {
    return await runSiteChecks();
  } catch {
    return null; // logged in jobRuns; don't block the read path
  }
}

// ── Read-side aggregation ──

export interface Incident {
  projectSlug: string;
  url: string;
  startedAt: number;
  endedAt: number | null; // null = ongoing
  failedChecks: number;
  lastStatus: number;
  lastError: string;
}

export interface ProjectHealth {
  projectSlug: string;
  org: string;
  url: string;
  lastCheckedAt: number;
  lastStatus: number;
  lastOk: boolean;
  lastTtfbMs: number | null;
  lastTotalMs: number | null;
  lastError: string;
  uptimePct: number;
  p50TtfbMs: number | null;
  p95TtfbMs: number | null;
  checkCount: number;
  series: Array<{ t: number; ttfbMs: number | null; ok: boolean }>;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function getSiteHealth(opts?: { days?: number }): {
  projects: ProjectHealth[];
  incidents: Incident[];
} {
  const days = opts?.days ?? 7;
  const sinceMs = Date.now() - days * 86400 * 1000;
  const checks = siteChecks.list({ sinceMs });

  const byProject = new Map<string, DbSiteCheck[]>();
  for (const c of checks) {
    let arr = byProject.get(c.projectSlug);
    if (!arr) {
      arr = [];
      byProject.set(c.projectSlug, arr);
    }
    arr.push(c); // already ordered by checkedAt
  }

  const result: ProjectHealth[] = [];
  const incidents: Incident[] = [];

  for (const [projectSlug, arr] of byProject) {
    const last = arr[arr.length - 1];
    const okCount = arr.filter((c) => c.ok === 1).length;
    const ttfbs = arr
      .filter((c) => c.ok === 1 && c.ttfbMs != null)
      .map((c) => c.ttfbMs as number)
      .sort((a, b) => a - b);

    result.push({
      projectSlug,
      org: last.org,
      url: last.url,
      lastCheckedAt: last.checkedAt,
      lastStatus: last.status,
      lastOk: last.ok === 1,
      lastTtfbMs: last.ttfbMs,
      lastTotalMs: last.totalMs,
      lastError: last.error,
      uptimePct: arr.length > 0 ? (okCount / arr.length) * 100 : 0,
      p50TtfbMs: percentile(ttfbs, 50),
      p95TtfbMs: percentile(ttfbs, 95),
      checkCount: arr.length,
      series: arr.map((c) => ({ t: c.checkedAt, ttfbMs: c.ttfbMs, ok: c.ok === 1 })),
    });

    // Derive incidents: consecutive failing checks form one incident
    let current: Incident | null = null;
    for (const c of arr) {
      if (c.ok === 0) {
        if (!current) {
          current = {
            projectSlug,
            url: c.url,
            startedAt: c.checkedAt,
            endedAt: null,
            failedChecks: 0,
            lastStatus: c.status,
            lastError: c.error,
          };
        }
        current.failedChecks += 1;
        current.lastStatus = c.status;
        current.lastError = c.error;
      } else if (current) {
        current.endedAt = c.checkedAt;
        incidents.push(current);
        current = null;
      }
    }
    if (current) incidents.push(current); // ongoing
  }

  // Worst first: down sites, then by p95
  result.sort((a, b) => {
    if (a.lastOk !== b.lastOk) return a.lastOk ? 1 : -1;
    return (b.p95TtfbMs ?? 0) - (a.p95TtfbMs ?? 0);
  });
  incidents.sort((a, b) => b.startedAt - a.startedAt);

  return { projects: result, incidents };
}
