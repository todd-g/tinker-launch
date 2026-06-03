import { NextResponse } from "next/server";
import { projects as projectsDb } from "@/lib/db";
import {
  readCredentials,
  writeCredentials,
  getMaskedCredentials,
  regenerateEnvrcForProject,
} from "@/lib/credentials";

/**
 * GET /api/credentials
 * Returns credentials with masked tokens
 */
export async function GET() {
  try {
    const credentials = await readCredentials();
    const masked = getMaskedCredentials(credentials);
    return NextResponse.json({ success: true, credentials: masked });
  } catch (error) {
    console.error("Error reading credentials:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to read credentials",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/credentials
 * Update credentials (accounts, org_mapping, and/or convex_keys)
 *
 * Body can include:
 * - accounts: Record<string, Account> - Full accounts object
 * - org_mapping: Record<string, string> - Full org mapping object
 * - addAccount: { key: string, account: Account } - Add a single account
 * - updateAccount: { key: string, updates: Partial<Account> } - Update account fields
 * - deleteAccount: { key: string } - Delete an account
 * - updateOrg: { org: string, accountKey: string } - Update/add org mapping
 * - deleteOrg: { org: string } - Delete an org
 * - setConvexKeys: { repoName: string, keys: { production?: string, preview?: string } } - Set Convex keys for a project
 * - deleteConvexKeys: { repoName: string } - Delete Convex keys for a project
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const credentials = await readCredentials();

    // Handle full replacement of accounts
    if (body.accounts) {
      credentials.accounts = body.accounts;
    }

    // Handle full replacement of org_mapping
    if (body.org_mapping) {
      credentials.org_mapping = body.org_mapping;
    }

    // Handle adding a single account
    if (body.addAccount) {
      const { key, account } = body.addAccount;
      credentials.accounts[key] = account;
    }

    // Handle updating a single account
    if (body.updateAccount) {
      const { key, updates } = body.updateAccount;
      if (credentials.accounts[key]) {
        // Only update fields that have non-empty values
        // This prevents overwriting existing tokens with empty strings
        const filteredUpdates: { name?: string; vercel_token?: string } = {};
        if (updates.name !== "" && updates.name !== undefined && updates.name !== null) {
          filteredUpdates.name = updates.name;
        }
        if (updates.vercel_token !== "" && updates.vercel_token !== undefined && updates.vercel_token !== null) {
          filteredUpdates.vercel_token = updates.vercel_token;
        }
        credentials.accounts[key] = {
          ...credentials.accounts[key],
          ...filteredUpdates,
        };
      }
    }

    // Handle deleting an account
    if (body.deleteAccount) {
      const { key } = body.deleteAccount;
      delete credentials.accounts[key];
      // Also remove from org mappings
      for (const [org, account] of Object.entries(credentials.org_mapping)) {
        if (account === key) {
          delete credentials.org_mapping[org];
        }
      }
    }

    // Handle updating org mapping
    if (body.updateOrg) {
      const { org, accountKey } = body.updateOrg;
      credentials.org_mapping[org] = accountKey;
    }

    // Handle deleting an org
    if (body.deleteOrg) {
      const { org } = body.deleteOrg;
      delete credentials.org_mapping[org];
    }

    // Handle setting Convex keys for a project
    if (body.setConvexKeys) {
      const { repoName, keys } = body.setConvexKeys;
      if (!credentials.convex_keys) {
        credentials.convex_keys = {};
      }
      // Merge with existing keys, only updating non-empty values
      const existingKeys = credentials.convex_keys[repoName] || {};
      const newKeys: { production?: string; preview?: string; dev?: string } = { ...existingKeys };
      if (keys.production !== undefined && keys.production !== "") {
        newKeys.production = keys.production;
      }
      if (keys.preview !== undefined && keys.preview !== "") {
        newKeys.preview = keys.preview;
      }
      if (keys.dev !== undefined && keys.dev !== "") {
        newKeys.dev = keys.dev;
      }
      credentials.convex_keys[repoName] = newKeys;
    }

    // Handle deleting Convex keys for a project
    if (body.deleteConvexKeys) {
      const { repoName } = body.deleteConvexKeys;
      if (credentials.convex_keys) {
        delete credentials.convex_keys[repoName];
      }
    }

    // Handle setting Linear API key for a workspace slug
    if (body.setLinearKey) {
      const { slug, key } = body.setLinearKey;
      if (!credentials.linear_keys) credentials.linear_keys = {};
      if (key !== undefined && key !== "") {
        credentials.linear_keys[slug] = key;
      }
    }

    // Handle deleting Linear API key for a workspace slug
    if (body.deleteLinearKey) {
      const { slug } = body.deleteLinearKey;
      if (credentials.linear_keys) {
        delete credentials.linear_keys[slug];
      }
    }

    // Handle setting Neon API key for an org slug
    if (body.setNeonKey) {
      const { slug, key } = body.setNeonKey;
      if (!credentials.neon_keys) credentials.neon_keys = {};
      if (key !== undefined && key !== "") {
        credentials.neon_keys[slug] = key;
      }
    }

    // Handle deleting Neon API key for an org slug
    if (body.deleteNeonKey) {
      const { slug } = body.deleteNeonKey;
      if (credentials.neon_keys) {
        delete credentials.neon_keys[slug];
      }
    }

    await writeCredentials(credentials);

    // Auto-regenerate .envrc for affected projects
    const envrcSync: { repoName: string; regenerated: boolean; reason?: string }[] = [];

    const regenProject = async (repoName: string) => {
      try {
        const project = projectsDb.getByRepoName(repoName);
        if (project?.localPath && project?.org) {
          const result = await regenerateEnvrcForProject(
            credentials,
            repoName,
            project.localPath,
            project.org,
            project.linearSlug || undefined,
            project.neonOrgSlug || undefined
          );
          envrcSync.push({ repoName, ...result });
        } else {
          envrcSync.push({ repoName, regenerated: false, reason: "project not found in database" });
        }
      } catch (e) {
        console.error("Error during .envrc auto-sync for", repoName, e);
        envrcSync.push({ repoName, regenerated: false, reason: `sync failed: ${e instanceof Error ? e.message : "unknown"}` });
      }
    };

    if (body.setConvexKeys) {
      await regenProject(body.setConvexKeys.repoName);
    }

    if (body.setLinearKey || body.deleteLinearKey) {
      const slug = body.setLinearKey?.slug ?? body.deleteLinearKey?.slug;
      const affected = projectsDb.list().filter((p) => p.linearSlug === slug);
      for (const p of affected) await regenProject(p.repoName);
    }

    if (body.setNeonKey || body.deleteNeonKey) {
      const slug = body.setNeonKey?.slug ?? body.deleteNeonKey?.slug;
      const affected = projectsDb.list().filter((p) => p.neonOrgSlug === slug);
      for (const p of affected) await regenProject(p.repoName);
    }

    // Return masked credentials
    const masked = getMaskedCredentials(credentials);
    return NextResponse.json({ success: true, credentials: masked, envrcSync });
  } catch (error) {
    console.error("Error updating credentials:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update credentials",
      },
      { status: 500 }
    );
  }
}
