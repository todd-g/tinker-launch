import { readCredentials, getAccount } from "@/lib/credentials";
import { usageDaily, jobRuns, settings } from "@/lib/db";

// ──────────────────────────────────────────────
// Provider usage ingestion
//
// Polls provider APIs and writes generic metric rows into usageDaily.
// Each ingest method tags rows with a `source` so a different method
// (e.g. a log-drain receiver for the personal account) can feed the
// same table with its own metrics later.
// ──────────────────────────────────────────────

const JOB_NAME = "vercel_usage_ingest";
const ENABLED_ACCOUNTS_KEY = "usage.enabledAccounts";
const AUTO_INGEST_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function getEnabledUsageAccounts(): string[] {
  const value = settings.get(ENABLED_ACCOUNTS_KEY);
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value as string[];
  }
  return ["minima"];
}

export function setEnabledUsageAccounts(accounts: string[]): void {
  settings.set(ENABLED_ACCOUNTS_KEY, accounts);
}

// ── Vercel API helpers ──

interface VercelTeam {
  id: string;
  slug: string;
}

interface VercelProject {
  id: string;
  name: string;
}

interface VercelDeployment {
  uid: string;
  created: number;
  state?: string;
  target?: string | null;
  buildingAt?: number;
  ready?: number;
}

async function vercelGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://api.vercel.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Vercel API ${res.status} on ${path.split("?")[0]}`);
  }
  return res.json() as Promise<T>;
}

async function listTeams(token: string): Promise<VercelTeam[]> {
  const data = await vercelGet<{ teams: VercelTeam[] }>("/v2/teams", token);
  return data.teams ?? [];
}

async function listProjects(token: string, teamId: string): Promise<VercelProject[]> {
  const projects: VercelProject[] = [];
  let until: number | null = null;
  for (let page = 0; page < 10; page++) {
    const cursor: string = until ? `&until=${until}` : "";
    const data: { projects: VercelProject[]; pagination?: { next: number | null } } = await vercelGet(
      `/v9/projects?teamId=${teamId}&limit=100${cursor}`,
      token
    );
    projects.push(...(data.projects ?? []));
    if (!data.pagination?.next || (data.projects ?? []).length < 100) break;
    until = data.pagination.next;
  }
  return projects;
}

/** Walk deployments backwards from now until sinceMs, paginating past the 100 cap. */
async function listDeployments(
  token: string,
  teamId: string,
  projectId: string,
  sinceMs: number
): Promise<VercelDeployment[]> {
  const all: VercelDeployment[] = [];
  let until = Date.now();
  for (let page = 0; page < 30; page++) {
    const data = await vercelGet<{ deployments: VercelDeployment[] }>(
      `/v6/deployments?teamId=${teamId}&projectId=${projectId}&since=${sinceMs}&until=${until}&limit=100`,
      token
    );
    const deps = data.deployments ?? [];
    if (deps.length === 0) break;
    all.push(...deps);
    if (deps.length < 100) break;
    const oldest = Math.min(...deps.map((d) => d.created));
    if (oldest <= sinceMs) break;
    until = oldest - 1;
  }
  return all.filter((d) => d.created >= sinceMs);
}

// ── Ingestion ──

function toDateStr(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface VercelIngestResult {
  account: string;
  teams: number;
  projects: number;
  deployments: number;
  rowsWritten: number;
}

/**
 * Poll the Vercel API for an account and upsert daily per-project metrics.
 * Metrics emitted: deploys, prod_deploys, error_deploys, build_ms.
 */
export async function runVercelUsageIngest(
  accountKey: string,
  opts?: { days?: number }
): Promise<VercelIngestResult> {
  const days = opts?.days ?? 35;
  const runId = jobRuns.start(JOB_NAME, accountKey);

  try {
    const credentials = await readCredentials();
    const account = getAccount(credentials, accountKey);
    if (!account?.vercel_token) {
      throw new Error(`No vercel_token for account "${accountKey}"`);
    }
    const token = account.vercel_token;
    const sinceMs = Date.now() - days * 86400 * 1000;

    const teams = await listTeams(token);
    let projectCount = 0;
    let deploymentCount = 0;

    // metric accumulator: projectSlug -> date -> metric -> value
    const acc = new Map<string, Map<string, Record<string, number>>>();

    for (const team of teams) {
      const projects = await listProjects(token, team.id);
      projectCount += projects.length;

      for (const project of projects) {
        const deps = await listDeployments(token, team.id, project.id, sinceMs);
        if (deps.length === 0) continue;
        deploymentCount += deps.length;

        let byDate = acc.get(project.name);
        if (!byDate) {
          byDate = new Map();
          acc.set(project.name, byDate);
        }

        for (const d of deps) {
          const date = toDateStr(d.created);
          let metrics = byDate.get(date);
          if (!metrics) {
            metrics = { deploys: 0, prod_deploys: 0, error_deploys: 0, build_ms: 0 };
            byDate.set(date, metrics);
          }
          metrics.deploys += 1;
          if (d.target === "production") metrics.prod_deploys += 1;
          if (d.state === "ERROR" || d.state === "CANCELED") metrics.error_deploys += 1;
          if (d.buildingAt && d.ready && d.ready > d.buildingAt) {
            metrics.build_ms += d.ready - d.buildingAt;
          }
        }
      }
    }

    const rows: Parameters<typeof usageDaily.upsertBatch>[0] = [];
    for (const [projectSlug, byDate] of acc) {
      for (const [date, metrics] of byDate) {
        for (const [metric, value] of Object.entries(metrics)) {
          rows.push({ account: accountKey, provider: "vercel", projectSlug, date, metric, value, source: "vercel_api" });
        }
      }
    }
    usageDaily.upsertBatch(rows);

    const result: VercelIngestResult = {
      account: accountKey,
      teams: teams.length,
      projects: projectCount,
      deployments: deploymentCount,
      rowsWritten: rows.length,
    };
    jobRuns.finish(runId, "success", { ...result, days });
    return result;
  } catch (error) {
    jobRuns.finish(runId, "error", String(error));
    throw error;
  }
}

/** Run ingest for all enabled accounts whose last successful run is older than the throttle interval. */
export async function runUsageIngestIfStale(opts?: { force?: boolean }): Promise<VercelIngestResult[]> {
  const results: VercelIngestResult[] = [];
  for (const accountKey of getEnabledUsageAccounts()) {
    const last = jobRuns.lastSuccess(JOB_NAME, accountKey);
    const stale = !last || Date.now() - last.startedAt > AUTO_INGEST_INTERVAL_MS;
    if (!stale && !opts?.force) continue;
    try {
      results.push(await runVercelUsageIngest(accountKey));
    } catch {
      // already logged in jobRuns; don't block the read path
    }
  }
  return results;
}
