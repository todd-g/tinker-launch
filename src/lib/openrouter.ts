// OpenRouter management-API client (workspaces + API keys) and the usage sync job.
// The management key lives in credentials.yaml (openrouter.management_key). Management keys
// can mint/list/patch/delete keys but cannot do inference. Plain fetch only — no shell calls.

import { readCredentials } from "@/lib/credentials";
import { jobRuns, openrouterKeyUsage, settings, type DbJobRun, type DbOpenRouterKeyUsage } from "@/lib/db";

const OPENROUTER_API = "https://openrouter.ai/api/v1";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_PAGES = 100; // pagination safety cap per listing

export const OPENROUTER_SYNC_JOB = "openrouter-sync";
const WORKSPACE_CACHE_KEY = "openrouterWorkspaces";

// ── Types ─────────────────────────────────────

export type OpenRouterLimitReset = "daily" | "weekly" | "monthly";

export interface OpenRouterWorkspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface OpenRouterKeyInfo {
  hash: string;
  name: string;
  label: string;
  disabled: boolean;
  limit: number | null;
  limit_remaining: number | null;
  limit_reset: string | null;
  include_byok_in_limit: boolean;
  usage: number;
  usage_daily: number;
  usage_weekly: number;
  usage_monthly: number;
  byok_usage?: number;
  byok_usage_daily?: number;
  byok_usage_weekly?: number;
  byok_usage_monthly?: number;
  created_at: string;
  updated_at: string | null;
  last_used_at?: string | null;
  expires_at?: string | null;
  workspace_id?: string;
}

export interface CreateKeyInput {
  name: string;
  limit?: number | null;
  limit_reset?: OpenRouterLimitReset | null;
  include_byok_in_limit?: boolean;
  workspace_id?: string;
}

export interface UpdateKeyInput {
  name?: string;
  disabled?: boolean;
  limit?: number | null;
  limit_reset?: OpenRouterLimitReset | null;
  include_byok_in_limit?: boolean;
}

export class OpenRouterError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
  }
}

// ── HTTP ──────────────────────────────────────

async function orRequest<T>(
  managementKey: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${OPENROUTER_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${managementKey}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    throw new OpenRouterError(`Could not reach OpenRouter: ${e instanceof Error ? e.message : String(e)}`, 0);
  }

  const text = await res.text();
  let json: unknown = undefined;
  if (text) {
    try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  }

  if (!res.ok) {
    const apiMsg = (json as { error?: { message?: string } } | undefined)?.error?.message || text.slice(0, 200) || res.statusText;
    if (res.status === 401 || res.status === 403) {
      throw new OpenRouterError(`OpenRouter management key invalid or lacks permission (HTTP ${res.status}: ${apiMsg})`, res.status);
    }
    if (res.status === 404) throw new OpenRouterError(`OpenRouter: not found (${method} ${path})`, 404);
    if (res.status === 429) throw new OpenRouterError("OpenRouter rate limit exceeded — try again shortly", 429);
    throw new OpenRouterError(`OpenRouter API error (HTTP ${res.status}): ${apiMsg}`, res.status);
  }

  return json as T;
}

// ── Workspaces ────────────────────────────────

export async function listWorkspaces(managementKey: string): Promise<OpenRouterWorkspace[]> {
  const pageSize = 100;
  const all: OpenRouterWorkspace[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await orRequest<{ data: OpenRouterWorkspace[]; total_count?: number }>(
      managementKey, "GET", `/workspaces?offset=${all.length}&limit=${pageSize}`
    );
    const data = res?.data ?? [];
    all.push(...data);
    if (data.length < pageSize) break;
    if (typeof res.total_count === "number" && all.length >= res.total_count) break;
  }
  return all;
}

export async function createWorkspace(
  managementKey: string,
  input: { name: string; slug: string; description?: string }
): Promise<OpenRouterWorkspace> {
  const res = await orRequest<{ data: OpenRouterWorkspace }>(managementKey, "POST", "/workspaces", input);
  return res.data;
}

// ── Keys ──────────────────────────────────────

/**
 * List keys in one workspace (or the account's default workspace when workspaceId is omitted —
 * that's OpenRouter's behavior, not "all keys"). Page size is undocumented, so page by offset
 * until an empty page or a page with no new hashes.
 */
export async function listKeys(
  managementKey: string,
  opts?: { workspaceId?: string; includeDisabled?: boolean }
): Promise<OpenRouterKeyInfo[]> {
  const seen = new Map<string, OpenRouterKeyInfo>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ offset: String(seen.size) });
    if (opts?.includeDisabled ?? true) qs.set("include_disabled", "true");
    if (opts?.workspaceId) qs.set("workspace_id", opts.workspaceId);
    const res = await orRequest<{ data: OpenRouterKeyInfo[] }>(managementKey, "GET", `/keys?${qs}`);
    const data = res?.data ?? [];
    let added = 0;
    for (const k of data) {
      if (!seen.has(k.hash)) {
        seen.set(k.hash, opts?.workspaceId && !k.workspace_id ? { ...k, workspace_id: opts.workspaceId } : k);
        added++;
      }
    }
    if (data.length === 0 || added === 0) break;
  }
  return [...seen.values()];
}

/** Every key on the account: default workspace + each workspace, de-duplicated by hash. */
export async function listAllKeys(
  managementKey: string
): Promise<{ workspaces: OpenRouterWorkspace[]; keys: OpenRouterKeyInfo[] }> {
  const workspaces = await listWorkspaces(managementKey);
  const byHash = new Map<string, OpenRouterKeyInfo>();
  for (const k of await listKeys(managementKey, { includeDisabled: true })) byHash.set(k.hash, k);
  for (const ws of workspaces) {
    for (const k of await listKeys(managementKey, { workspaceId: ws.id, includeDisabled: true })) {
      byHash.set(k.hash, k);
    }
  }
  return { workspaces, keys: [...byHash.values()] };
}

export async function getKey(managementKey: string, hash: string): Promise<OpenRouterKeyInfo> {
  const res = await orRequest<{ data: OpenRouterKeyInfo }>(managementKey, "GET", `/keys/${encodeURIComponent(hash)}`);
  return res.data;
}

/** Create a key. The plaintext `key` is only ever returned here — store it immediately. */
export async function createKey(
  managementKey: string,
  input: CreateKeyInput
): Promise<{ data: OpenRouterKeyInfo; key: string }> {
  const res = await orRequest<{ data: OpenRouterKeyInfo; key: string }>(managementKey, "POST", "/keys", input);
  if (!res?.key || !res?.data?.hash) throw new OpenRouterError("OpenRouter create-key response missing key or hash", 502);
  return res;
}

export async function updateKey(
  managementKey: string,
  hash: string,
  input: UpdateKeyInput
): Promise<OpenRouterKeyInfo> {
  const res = await orRequest<{ data: OpenRouterKeyInfo }>(managementKey, "PATCH", `/keys/${encodeURIComponent(hash)}`, input);
  return res.data;
}

export async function deleteKey(managementKey: string, hash: string): Promise<void> {
  await orRequest<unknown>(managementKey, "DELETE", `/keys/${encodeURIComponent(hash)}`);
}

// ── Workspace cache (settings table — non-secret) ──

export interface CachedWorkspaces {
  workspaces: OpenRouterWorkspace[];
  updatedAt: number;
}

export function getCachedWorkspaces(): CachedWorkspaces {
  const v = settings.get(WORKSPACE_CACHE_KEY) as CachedWorkspaces | undefined;
  return v && Array.isArray(v.workspaces) ? v : { workspaces: [], updatedAt: 0 };
}

export function setCachedWorkspaces(workspaces: OpenRouterWorkspace[]): void {
  const slim = workspaces.map(({ id, name, slug, description, created_at }) => ({ id, name, slug, description: description ?? null, created_at }));
  settings.set(WORKSPACE_CACHE_KEY, { workspaces: slim, updatedAt: Date.now() });
}

// ── Snapshots + sync ──────────────────────────

export function utcDate(ms: number = Date.now()): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Write today's (UTC) snapshot row for each key — used by the full sync and after single-key edits. */
export function snapshotKeys(keys: OpenRouterKeyInfo[], now: number = Date.now()): void {
  const date = utcDate(now);
  const rows: DbOpenRouterKeyUsage[] = keys.map((k) => ({
    hash: k.hash,
    date,
    name: k.name ?? "",
    label: k.label ?? "",
    workspaceId: k.workspace_id ?? "",
    usage: num(k.usage),
    usageDaily: num(k.usage_daily),
    usageWeekly: num(k.usage_weekly),
    usageMonthly: num(k.usage_monthly),
    limitUsd: numOrNull(k.limit),
    limitRemaining: numOrNull(k.limit_remaining),
    limitReset: k.limit_reset ?? null,
    disabled: k.disabled ? 1 : 0,
    lastUsedAt: k.last_used_at ?? null,
    createdAt: k.created_at ?? null,
    syncedAt: now,
  }));
  if (rows.length > 0) openrouterKeyUsage.upsertSnapshots(rows);
}

export interface OpenRouterSyncResult {
  ok: boolean;
  runId: number;
  keysSynced: number;
  workspaces: number;
  error?: string;
}

async function runSync(): Promise<OpenRouterSyncResult> {
  const runId = jobRuns.start(OPENROUTER_SYNC_JOB);
  try {
    const credentials = await readCredentials();
    const managementKey = credentials.openrouter.management_key;
    if (!managementKey) throw new Error("No OpenRouter management key configured");

    const { workspaces, keys } = await listAllKeys(managementKey);
    setCachedWorkspaces(workspaces);
    snapshotKeys(keys);

    const detail = { keysSynced: keys.length, workspaces: workspaces.length, date: utcDate() };
    jobRuns.finish(runId, "success", detail);
    return { ok: true, runId, keysSynced: keys.length, workspaces: workspaces.length };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    jobRuns.finish(runId, "error", { keysSynced: 0, error });
    return { ok: false, runId, keysSynced: 0, workspaces: 0, error };
  }
}

// One in-flight sync per server process; concurrent callers share it.
const g = globalThis as typeof globalThis & { __openrouterSyncInflight?: Promise<OpenRouterSyncResult> | null };

/** List every key on the account, upsert today's usage snapshots, and log a jobRuns row. Never throws. */
export function syncOpenRouterUsage(): Promise<OpenRouterSyncResult> {
  if (!g.__openrouterSyncInflight) {
    g.__openrouterSyncInflight = runSync().finally(() => { g.__openrouterSyncInflight = null; });
  }
  return g.__openrouterSyncInflight;
}

export function lastSuccessfulSync(): DbJobRun | undefined {
  return jobRuns.lastSuccess(OPENROUTER_SYNC_JOB, "");
}

export function recentSyncRuns(limit = 20): DbJobRun[] {
  return jobRuns.list({ job: OPENROUTER_SYNC_JOB, limit });
}

const AUTO_SYNC_STALE_MS = 10 * 60_000;   // re-sync when the last success is older than this
const AUTO_SYNC_RETRY_MS = 60_000;        // …but don't hammer the API after a recent failed attempt

/** Should a page load trigger a sync? (connected + stale + no attempt in the last minute) */
export function shouldAutoSync(now: number = Date.now()): boolean {
  const last = lastSuccessfulSync();
  if (last && now - last.startedAt < AUTO_SYNC_STALE_MS) return false;
  const [latestAttempt] = recentSyncRuns(1);
  if (latestAttempt && now - latestAttempt.startedAt < AUTO_SYNC_RETRY_MS) return false;
  return true;
}
