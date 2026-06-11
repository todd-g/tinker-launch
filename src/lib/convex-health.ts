import { readCredentials, getAccountForOrg } from "@/lib/credentials";
import { projects, usageDaily } from "@/lib/db";

// ──────────────────────────────────────────────
// Convex deployment health
//
// Talks directly to each production deployment's app_metrics API
// (the same endpoints the Convex dashboard uses — discovered via the
// open-source convex-backend repo). Auth is the deploy key we already
// store in credentials.yaml. Live reads; a daily snapshot of call
// volume is persisted to usageDaily (provider='convex').
// ──────────────────────────────────────────────

interface SerializedDate {
  secs_since_epoch: number;
  nanos_since_epoch: number;
}
type Timeseries = [SerializedDate, number | null][];
type TopKResponse = [string, Timeseries][];
type LatencyResponse = [number, Timeseries][];

const FETCH_TIMEOUT_MS = 15000;

function windowParam(hours: number, buckets: number): string {
  const now = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    start: { secs_since_epoch: now - hours * 3600, nanos_since_epoch: 0 },
    end: { secs_since_epoch: now, nanos_since_epoch: 0 },
    num_buckets: buckets,
  });
}

async function metricsGet<T>(
  deployment: string,
  key: string,
  endpoint: string,
  params: Record<string, string>
): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://${deployment}.convex.cloud/api/app_metrics/${endpoint}?${qs}`, {
    headers: { Authorization: `Convex ${key}`, "Convex-Client": "tinker-launch-0.1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`${endpoint} HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Extract the deployment name from a deploy key like "prod:content-rook-737|ey..." */
export function deploymentFromKey(deployKey: string): string | null {
  const prefix = deployKey.split("|")[0];
  const parts = prefix.split(":");
  return parts.length === 2 ? parts[1] : null;
}

export interface ConvexFunctionCalls {
  fn: string;
  calls: number;
  p50Ms: number | null;
  p95Ms: number | null;
}

export interface ConvexFailure {
  fn: string;
  failurePct: number;
}

export interface ConvexDeploymentHealth {
  projectSlug: string;
  org: string;
  deployment: string;
  totalCalls24h: number;
  hourlyCalls: Array<{ t: number; calls: number }>;
  topFunctions: ConvexFunctionCalls[];
  failures: ConvexFailure[];
  error: string | null;
}

async function fetchDeploymentHealth(
  projectSlug: string,
  org: string,
  deployment: string,
  key: string
): Promise<ConvexDeploymentHealth> {
  const base: ConvexDeploymentHealth = {
    projectSlug,
    org,
    deployment,
    totalCalls24h: 0,
    hourlyCalls: [],
    topFunctions: [],
    failures: [],
    error: null,
  };

  try {
    const [callsHourly, failures] = await Promise.all([
      metricsGet<TopKResponse>(deployment, key, "function_call_count_top_k", {
        window: windowParam(24, 24),
        k: "5",
      }),
      metricsGet<TopKResponse>(deployment, key, "failure_percentage_top_k", {
        window: windowParam(24, 1),
        k: "5",
      }),
    ]);

    // Hourly totals summed across all returned functions (incl. _rest)
    const hourly = new Map<number, number>();
    const callTotals: Array<{ fn: string; calls: number }> = [];
    for (const [fn, series] of callsHourly) {
      let total = 0;
      for (const [date, value] of series) {
        if (value == null) continue;
        total += value;
        const t = date.secs_since_epoch * 1000;
        hourly.set(t, (hourly.get(t) ?? 0) + value);
      }
      callTotals.push({ fn, calls: total });
    }
    base.totalCalls24h = callTotals.reduce((sum, c) => sum + c.calls, 0);
    base.hourlyCalls = [...hourly.entries()].sort((a, b) => a[0] - b[0]).map(([t, calls]) => ({ t, calls }));

    base.failures = failures
      .filter(([fn]) => fn !== "_rest")
      .map(([fn, series]) => {
        const vals = series.map(([, v]) => v).filter((v): v is number => v != null);
        return { fn, failurePct: vals.length ? Math.max(...vals) : 0 };
      })
      .filter((f) => f.failurePct > 0)
      .sort((a, b) => b.failurePct - a.failurePct);

    // Latency p50/p95 for the top 3 named functions
    const named = callTotals.filter((c) => c.fn !== "_rest").sort((a, b) => b.calls - a.calls);
    const top3 = named.slice(0, 3);
    const latencies = await Promise.all(
      top3.map(async ({ fn }) => {
        try {
          const data = await metricsGet<LatencyResponse>(deployment, key, "latency_percentiles", {
            window: windowParam(24, 1),
            udfPath: fn,
            percentiles: "[50,95]",
          });
          const byPct = new Map<number, number | null>();
          for (const [pct, series] of data) {
            const vals = series.map(([, v]) => v).filter((v): v is number => v != null);
            byPct.set(pct, vals.length ? vals[vals.length - 1] : null);
          }
          return { p50: byPct.get(50) ?? null, p95: byPct.get(95) ?? null };
        } catch {
          return { p50: null, p95: null };
        }
      })
    );

    base.topFunctions = top3.map(({ fn, calls }, i) => ({
      fn,
      calls,
      p50Ms: latencies[i].p50 != null ? latencies[i].p50! * 1000 : null,
      p95Ms: latencies[i].p95 != null ? latencies[i].p95! * 1000 : null,
    }));
  } catch (e) {
    base.error = e instanceof Error ? e.message : String(e);
  }
  return base;
}

function todayDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Fan out to every production Convex deployment in credentials.yaml. */
export async function getConvexHealth(): Promise<ConvexDeploymentHealth[]> {
  const credentials = await readCredentials();

  const targets: Array<{ projectSlug: string; org: string; deployment: string; key: string }> = [];
  for (const [repoName, keys] of Object.entries(credentials.convex_keys)) {
    if (!keys.production) continue;
    const deployment = deploymentFromKey(keys.production);
    if (!deployment) continue;
    const project = projects.getByRepoName(repoName);
    targets.push({ projectSlug: repoName, org: project?.org ?? "", deployment, key: keys.production });
  }

  const results = await Promise.all(
    targets.map((t) => fetchDeploymentHealth(t.projectSlug, t.org, t.deployment, t.key))
  );

  // Persist a daily call-volume snapshot for trends (last writer wins per day)
  const date = todayDateStr();
  const rows = results
    .filter((r) => !r.error)
    .map((r) => ({
      account: r.org ? getAccountForOrg(credentials, r.org) ?? "" : "",
      provider: "convex",
      projectSlug: r.projectSlug,
      date,
      metric: "function_calls_24h",
      value: r.totalCalls24h,
      source: "convex_deployment_api",
    }));
  if (rows.length > 0) usageDaily.upsertBatch(rows);

  return results.sort((a, b) => b.totalCalls24h - a.totalCalls24h);
}
