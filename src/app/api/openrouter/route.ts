import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { projects as projectsDb, openrouterKeyUsage, type DbProject, type DbOpenRouterKeyUsage } from "@/lib/db";
import {
  readCredentials,
  writeCredentials,
  maskToken,
  regenerateEnvrcForProject,
  type Credentials,
} from "@/lib/credentials";
import {
  OpenRouterError,
  listWorkspaces,
  createWorkspace,
  createKey,
  updateKey,
  deleteKey,
  getKey,
  snapshotKeys,
  syncOpenRouterUsage,
  shouldAutoSync,
  lastSuccessfulSync,
  recentSyncRuns,
  getCachedWorkspaces,
  setCachedWorkspaces,
  utcDate,
  type OpenRouterLimitReset,
  type OpenRouterSyncResult,
} from "@/lib/openrouter";

// Admin API for OpenRouter keys + workspaces. Secrets (management key, project inference keys)
// never leave the server except the one-time plaintext key in the createProjectKey response.

const LIMIT_RESETS = new Set(["daily", "weekly", "monthly"]);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class BadRequest extends Error {}

function fail(error: unknown) {
  if (error instanceof BadRequest) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
  if (error instanceof OpenRouterError) {
    return NextResponse.json({ success: false, error: error.message, status: error.status }, { status: 502 });
  }
  console.error("OpenRouter API route error:", error);
  return NextResponse.json(
    { success: false, error: error instanceof Error ? error.message : "OpenRouter request failed" },
    { status: 500 }
  );
}

function requireManagementKey(credentials: Credentials): string {
  const key = credentials.openrouter.management_key;
  if (!key) throw new BadRequest("No OpenRouter management key configured");
  return key;
}

function requireProject(repoName: unknown): DbProject {
  if (typeof repoName !== "string" || !repoName) throw new BadRequest("repoName is required");
  const project = projectsDb.getByRepoName(repoName);
  if (!project) throw new BadRequest(`Project "${repoName}" not found`);
  return project;
}

/** OpenRouter is Minima-only: a project may hold a key only if its org is mapped to a workspace. */
function requireMappedOrg(credentials: Credentials, project: DbProject): string {
  const workspaceId = credentials.openrouter.org_workspaces[project.org];
  if (!workspaceId) {
    throw new BadRequest(
      `Org "${project.org}" is not mapped to an OpenRouter workspace — map it in Settings → OpenRouter → Workspaces first (only mapped orgs may hold OpenRouter keys).`
    );
  }
  return workspaceId;
}

function parseLimit(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) throw new BadRequest("limit must be a non-negative number of USD (or null for no limit)");
  return n;
}

function parseLimitReset(v: unknown): OpenRouterLimitReset | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "" || v === "none") return null;
  if (typeof v !== "string" || !LIMIT_RESETS.has(v)) throw new BadRequest("limitReset must be daily, weekly, monthly, or null");
  return v as OpenRouterLimitReset;
}

/** Rewrite the project's .envrc from current credentials if its folder exists. */
async function regenEnvrc(credentials: Credentials, project: DbProject) {
  if (!project.localPath || !existsSync(project.localPath)) {
    return { regenerated: false, reason: "project folder not found" };
  }
  try {
    return await regenerateEnvrcForProject(
      credentials,
      project.repoName,
      project.localPath,
      project.org,
      project.linearSlug || undefined,
      project.neonOrgSlug || undefined
    );
  } catch (e) {
    return { regenerated: false, reason: `envrc write failed: ${e instanceof Error ? e.message : "unknown"}` };
  }
}

function usageView(snap: DbOpenRouterKeyUsage | undefined, presentSince: number) {
  if (!snap) return null;
  const today = utcDate();
  return {
    name: snap.name,
    label: snap.label,
    workspaceId: snap.workspaceId,
    // usage_daily / usage_monthly are "current UTC day/month as of the snapshot" — zero them if stale
    today: snap.date === today ? snap.usageDaily : 0,
    month: snap.date.slice(0, 7) === today.slice(0, 7) ? snap.usageMonthly : 0,
    total: snap.usage,
    limit: snap.limitUsd,
    limitRemaining: snap.limitRemaining,
    limitReset: snap.limitReset,
    disabled: !!snap.disabled,
    lastUsedAt: snap.lastUsedAt,
    createdAt: snap.createdAt,
    syncedAt: snap.syncedAt,
    // Not seen in the latest successful sync → deleted on OpenRouter (or never synced since)
    missing: presentSince > 0 && snap.syncedAt < presentSince,
  };
}

function parseDetail(detail: string): Record<string, unknown> {
  try { return JSON.parse(detail) as Record<string, unknown>; } catch { return { message: detail }; }
}

/**
 * GET /api/openrouter
 * Connection status, workspaces, org→workspace map, projects with key + latest usage,
 * unlinked keys, and sync runs. Auto-syncs (at most one sync) when the data is stale.
 */
export async function GET() {
  try {
    let credentials = await readCredentials();
    const connected = !!credentials.openrouter.management_key;

    let autoSync: OpenRouterSyncResult | null = null;
    if (connected && shouldAutoSync()) {
      autoSync = await syncOpenRouterUsage();
      credentials = await readCredentials();
    }

    const or = credentials.openrouter;
    const lastSuccess = lastSuccessfulSync() ?? null;
    const presentSince = lastSuccess?.startedAt ?? 0;
    const latest = openrouterKeyUsage.latestPerHash();
    const byHash = new Map(latest.map((r) => [r.hash, r]));

    // Non-archived projects, plus archived ones that still hold a key record (nothing goes invisible)
    const allProjects = projectsDb
      .list(undefined, { includeArchived: true })
      .filter((p) => !p.archived || or.project_keys[p.repoName]);

    const projects = allProjects.map((p) => {
      const rec = or.project_keys[p.repoName];
      return {
        id: p.id,
        repoName: p.repoName,
        projectName: p.projectName,
        org: p.org,
        archived: !!p.archived,
        hasLocalPath: !!p.localPath && existsSync(p.localPath),
        orgWorkspaceId: or.org_workspaces[p.org] ?? null,
        key: rec
          ? {
              hash: rec.hash,
              name: rec.name,
              workspaceId: rec.workspace_id,
              createdAt: rec.created_at,
              hasSecret: !!rec.key,
              masked: rec.key ? maskToken(rec.key) : null,
            }
          : null,
        usage: rec ? usageView(byHash.get(rec.hash), presentSince) : null,
      };
    });

    const linkedHashes = new Set(Object.values(or.project_keys).map((k) => k.hash));
    const unlinkedKeys = latest
      .filter((s) => !linkedHashes.has(s.hash) && (presentSince === 0 || s.syncedAt >= presentSince))
      .map((s) => ({ hash: s.hash, ...usageView(s, presentSince)! }));

    const { workspaces: cachedWorkspaces, updatedAt: workspacesUpdatedAt } = getCachedWorkspaces();
    const workspaces = cachedWorkspaces.map((w) => ({
      ...w,
      linkedProjects: Object.values(or.project_keys).filter((k) => k.workspace_id === w.id).length,
      mappedOrgs: Object.entries(or.org_workspaces).filter(([, id]) => id === w.id).map(([org]) => org),
    }));

    // Tinker orgs: everything in org_mapping plus any org a project uses
    const orgs = [...new Set([...Object.keys(credentials.org_mapping), ...allProjects.map((p) => p.org)].filter(Boolean))].sort();

    const runs = recentSyncRuns(20).map((r) => ({ ...r, detail: parseDetail(r.detail) }));

    return NextResponse.json({
      success: true,
      connected,
      managementKeyMasked: connected ? maskToken(or.management_key!) : null,
      keyCount: presentSince > 0 ? latest.filter((s) => s.syncedAt >= presentSince).length : latest.length,
      workspaces,
      workspacesUpdatedAt,
      orgWorkspaces: or.org_workspaces,
      orgs,
      projects,
      unlinkedKeys,
      lastSync: lastSuccess ? { ...lastSuccess, detail: parseDetail(lastSuccess.detail) } : null,
      recentRuns: runs,
      autoSync,
    });
  } catch (error) {
    return fail(error);
  }
}

/**
 * POST /api/openrouter  { action, ...params }
 * Actions: setManagementKey, removeManagementKey, createWorkspace, mapOrgWorkspace,
 * createProjectKey, updateProjectKey, linkExistingKey, unlinkProjectKey, revokeProjectKey, sync
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body?.action as string;

    switch (action) {
      case "setManagementKey": {
        const key = typeof body.key === "string" ? body.key.trim() : "";
        if (!key) throw new BadRequest("key is required");
        const workspaces = await listWorkspaces(key); // validates before saving
        const credentials = await readCredentials();
        credentials.openrouter.management_key = key;
        await writeCredentials(credentials);
        setCachedWorkspaces(workspaces);
        const sync = await syncOpenRouterUsage();
        return NextResponse.json({ success: true, workspaces: workspaces.length, sync });
      }

      case "removeManagementKey": {
        const credentials = await readCredentials();
        delete credentials.openrouter.management_key;
        await writeCredentials(credentials);
        return NextResponse.json({ success: true });
      }

      case "createWorkspace": {
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const slug = typeof body.slug === "string" ? body.slug.trim() : "";
        const description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : undefined;
        if (!name || name.length > 100) throw new BadRequest("name is required (max 100 chars)");
        if (!SLUG_RE.test(slug) || slug.length > 50) throw new BadRequest("slug must be lowercase letters/numbers separated by single hyphens (max 50 chars)");
        const credentials = await readCredentials();
        const mk = requireManagementKey(credentials);
        const workspace = await createWorkspace(mk, { name, slug, ...(description ? { description } : {}) });
        const cached = getCachedWorkspaces().workspaces.filter((w) => w.id !== workspace.id);
        setCachedWorkspaces([...cached, workspace]);
        return NextResponse.json({ success: true, workspace });
      }

      case "mapOrgWorkspace": {
        const org = typeof body.org === "string" ? body.org : "";
        if (!org) throw new BadRequest("org is required");
        const workspaceId = typeof body.workspaceId === "string" && body.workspaceId ? body.workspaceId : null;
        const credentials = await readCredentials();
        if (workspaceId) credentials.openrouter.org_workspaces[org] = workspaceId;
        else delete credentials.openrouter.org_workspaces[org];
        await writeCredentials(credentials);
        return NextResponse.json({ success: true, orgWorkspaces: credentials.openrouter.org_workspaces });
      }

      case "createProjectKey": {
        const project = requireProject(body.repoName);
        const limit = parseLimit(body.limit);
        const limitReset = parseLimitReset(body.limitReset);
        let credentials = await readCredentials();
        const mk = requireManagementKey(credentials);
        const mappedWorkspace = requireMappedOrg(credentials, project);
        if (credentials.openrouter.project_keys[project.repoName]) {
          throw new BadRequest(`"${project.repoName}" already has an OpenRouter key — unlink or revoke it first`);
        }
        const workspaceId = typeof body.workspaceId === "string" && body.workspaceId ? body.workspaceId : mappedWorkspace;

        const created = await createKey(mk, {
          name: project.repoName,
          workspace_id: workspaceId,
          ...(limit !== undefined && limit !== null ? { limit } : {}),
          ...(limit !== undefined && limit !== null && limitReset ? { limit_reset: limitReset } : {}),
        });

        // Persist the secret immediately — OpenRouter never returns it again
        credentials = await readCredentials();
        credentials.openrouter.project_keys[project.repoName] = {
          hash: created.data.hash,
          key: created.key,
          workspace_id: created.data.workspace_id || workspaceId,
          name: created.data.name || project.repoName,
          created_at: created.data.created_at || new Date().toISOString(),
        };
        await writeCredentials(credentials);

        const envrc = await regenEnvrc(credentials, project);
        snapshotKeys([{ ...created.data, workspace_id: created.data.workspace_id || workspaceId }]);
        const sync = await syncOpenRouterUsage();
        return NextResponse.json({ success: true, key: created.key, hash: created.data.hash, envrc, sync });
      }

      case "updateProjectKey": {
        const project = requireProject(body.repoName);
        const credentials = await readCredentials();
        const mk = requireManagementKey(credentials);
        const rec = credentials.openrouter.project_keys[project.repoName];
        if (!rec) throw new BadRequest(`"${project.repoName}" has no OpenRouter key`);
        const limit = parseLimit(body.limit);
        const limitReset = parseLimitReset(body.limitReset);
        const patch: Parameters<typeof updateKey>[2] = {};
        if (limit !== undefined) patch.limit = limit;
        // Removing the limit also clears its reset period
        if (limit === null) patch.limit_reset = null;
        else if (limitReset !== undefined) patch.limit_reset = limitReset;
        if (typeof body.disabled === "boolean") patch.disabled = body.disabled;
        if (Object.keys(patch).length === 0) throw new BadRequest("nothing to update");
        const updated = await updateKey(mk, rec.hash, patch);
        snapshotKeys([{ ...updated, workspace_id: updated.workspace_id || rec.workspace_id }]);
        return NextResponse.json({ success: true });
      }

      case "linkExistingKey": {
        const project = requireProject(body.repoName);
        const hash = typeof body.hash === "string" ? body.hash : "";
        if (!hash) throw new BadRequest("hash is required");
        const credentials = await readCredentials();
        requireMappedOrg(credentials, project);
        if (credentials.openrouter.project_keys[project.repoName]) {
          throw new BadRequest(`"${project.repoName}" already has an OpenRouter key — unlink it first`);
        }
        const owner = Object.entries(credentials.openrouter.project_keys).find(([, k]) => k.hash === hash);
        if (owner) throw new BadRequest(`That key is already linked to "${owner[0]}"`);

        // Prefer live data; fall back to the latest snapshot when not connected
        let info: { name: string; workspaceId: string; createdAt: string } | null = null;
        const mk = credentials.openrouter.management_key;
        if (mk) {
          const k = await getKey(mk, hash);
          snapshotKeys([k]);
          info = { name: k.name, workspaceId: k.workspace_id ?? "", createdAt: k.created_at };
        } else {
          const snap = openrouterKeyUsage.latestPerHash().find((s) => s.hash === hash);
          if (snap) info = { name: snap.name, workspaceId: snap.workspaceId, createdAt: snap.createdAt ?? "" };
        }
        if (!info) throw new BadRequest("Key not found on OpenRouter");

        credentials.openrouter.project_keys[project.repoName] = {
          hash,
          workspace_id: info.workspaceId,
          name: info.name,
          created_at: info.createdAt || new Date().toISOString(),
        };
        await writeCredentials(credentials);
        return NextResponse.json({ success: true });
      }

      case "unlinkProjectKey": {
        const project = requireProject(body.repoName);
        const credentials = await readCredentials();
        const rec = credentials.openrouter.project_keys[project.repoName];
        if (!rec) throw new BadRequest(`"${project.repoName}" has no OpenRouter key`);
        delete credentials.openrouter.project_keys[project.repoName];
        await writeCredentials(credentials);
        const envrc = rec.key ? await regenEnvrc(credentials, project) : { regenerated: false, reason: "no secret was in .envrc" };
        return NextResponse.json({ success: true, envrc });
      }

      case "revokeProjectKey": {
        const project = requireProject(body.repoName);
        let credentials = await readCredentials();
        const mk = requireManagementKey(credentials);
        const rec = credentials.openrouter.project_keys[project.repoName];
        if (!rec) throw new BadRequest(`"${project.repoName}" has no OpenRouter key`);
        let alreadyGone = false;
        try {
          await deleteKey(mk, rec.hash);
        } catch (e) {
          if (e instanceof OpenRouterError && e.status === 404) alreadyGone = true;
          else throw e;
        }
        // Usage snapshots are kept — they're the billing history for this key
        credentials = await readCredentials();
        delete credentials.openrouter.project_keys[project.repoName];
        await writeCredentials(credentials);
        const envrc = await regenEnvrc(credentials, project);
        return NextResponse.json({ success: true, alreadyGone, envrc });
      }

      case "sync": {
        const sync = await syncOpenRouterUsage();
        if (!sync.ok) return NextResponse.json({ success: false, error: sync.error, sync }, { status: 502 });
        return NextResponse.json({ success: true, sync });
      }

      default:
        throw new BadRequest(`Unknown action: ${String(action)}`);
    }
  } catch (error) {
    return fail(error);
  }
}
