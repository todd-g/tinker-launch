import { readFile, writeFile, mkdir, chmod } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import YAML from "yaml";

// Types
export interface Account {
  name: string;
  vercel_token: string;
  git_email?: string;
  git_name?: string;
}

export interface ConvexKeys {
  production?: string;
  preview?: string;
  dev?: string;
}

export interface OpenRouterProjectKey {
  hash: string;          // OpenRouter key hash (stable id used by the management API)
  key?: string;          // plaintext inference key (secret); absent = tracking-only link
  workspace_id: string;
  name: string;
  created_at: string;
}

export interface OpenRouterCredentials {
  management_key?: string;                            // management key — can mint/list keys, cannot do inference
  org_workspaces: Record<string, string>;             // Tinker org -> OpenRouter workspace_id (default for new keys)
  project_keys: Record<string, OpenRouterProjectKey>; // keyed by repo name
}

export interface Credentials {
  accounts: Record<string, Account>;
  org_mapping: Record<string, string>;
  convex_keys: Record<string, ConvexKeys>;  // keyed by repo name
  linear_keys: Record<string, string>;      // keyed by Linear workspace slug
  neon_keys: Record<string, string>;        // keyed by Neon org slug (free-form identifier)
  openrouter: OpenRouterCredentials;
}

// Default credentials structure
const DEFAULT_CREDENTIALS: Credentials = {
  accounts: {},
  org_mapping: {},
  convex_keys: {},
  linear_keys: {},
  neon_keys: {},
  openrouter: { org_workspaces: {}, project_keys: {} },
};

/**
 * Normalize the openrouter section so a partial/missing YAML block never drops data
 * on the next write. Never emits `management_key: undefined` (keeps the YAML clean).
 */
function normalizeOpenRouter(raw: Partial<OpenRouterCredentials> | undefined | null): OpenRouterCredentials {
  const out: OpenRouterCredentials = {
    org_workspaces: { ...(raw?.org_workspaces || {}) },
    project_keys: { ...(raw?.project_keys || {}) },
  };
  if (raw?.management_key) out.management_key = raw.management_key;
  return out;
}

/**
 * Get the path to the credentials directory
 */
export function getCredentialsDir(): string {
  return path.join(process.env.HOME || "", ".tinker-launch");
}

/**
 * Get the full path to credentials.yaml
 */
export function getCredentialsPath(): string {
  return path.join(getCredentialsDir(), "credentials.yaml");
}

/**
 * Ensure the credentials directory exists
 */
async function ensureCredentialsDir(): Promise<void> {
  const dir = getCredentialsDir();
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Write a file that holds secrets (credentials.yaml, .envrc) as owner-only (0600).
 * `mode` only applies when the file is created, so chmod existing files too.
 */
export async function writeSecretFile(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content, { mode: 0o600 });
  await chmod(filePath, 0o600);
}

// Vars generateEnvrcContent owns. Anything else in a project's .envrc was added by hand
// (Sentry, PostHog, QA passwords, ...) and must survive regeneration.
const MANAGED_ENVRC_VARS = new Set([
  "VERCEL_TOKEN",
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOY_KEY_PREVIEW",
  "CONVEX_DEPLOY_KEY_DEV",
  "LINEAR_API_KEY",
  "NEON_API_KEY",
  "OPENROUTER_API_KEY",
]);

function isGeneratedEnvrcLine(line: string): boolean {
  const exportMatch = line.match(/^\s*export\s+([A-Za-z_][A-Za-z0-9_]*)=/);
  if (exportMatch) return MANAGED_ENVRC_VARS.has(exportMatch[1]);
  const t = line.trim();
  return (
    t === "# Tinker Launch generated credentials" ||
    t.startsWith("# Account: ") ||
    t === "# DO NOT commit this file to git"
  );
}

/**
 * Merge freshly generated .envrc content with an existing file: the managed vars and header
 * are replaced, every other line (hand-added exports, comments) is kept below them.
 * Idempotent — regenerating twice yields the same file.
 */
export function mergeEnvrcContent(generated: string, existing: string | null): string {
  if (!existing) return generated;
  const kept = existing.split("\n").filter((line) => !isGeneratedEnvrcLine(line));
  while (kept.length && !kept[0].trim()) kept.shift();
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  if (!kept.length) return generated;
  return `${generated}\n${kept.join("\n")}\n`;
}

/** Write a project's .envrc, preserving any hand-added lines already in it. */
export async function writeEnvrc(envrcPath: string, generated: string): Promise<void> {
  const existing = existsSync(envrcPath) ? await readFile(envrcPath, "utf-8") : null;
  await writeSecretFile(envrcPath, mergeEnvrcContent(generated, existing));
}

/**
 * Read credentials from ~/.tinker-launch/credentials.yaml
 * Creates default file if it doesn't exist
 */
export async function readCredentials(): Promise<Credentials> {
  const credPath = getCredentialsPath();

  try {
    if (!existsSync(credPath)) {
      // Create default credentials file
      await ensureCredentialsDir();
      await writeSecretFile(credPath, YAML.stringify(DEFAULT_CREDENTIALS));
      return structuredClone(DEFAULT_CREDENTIALS);
    }

    const content = await readFile(credPath, "utf-8");
    const parsed = YAML.parse(content) as Credentials;

    // Ensure structure is complete
    return {
      accounts: parsed.accounts || {},
      org_mapping: parsed.org_mapping || {},
      convex_keys: parsed.convex_keys || {},
      linear_keys: parsed.linear_keys || {},
      neon_keys: parsed.neon_keys || {},
      openrouter: normalizeOpenRouter(parsed.openrouter),
    };
  } catch (error) {
    console.error("Error reading credentials:", error);
    return structuredClone(DEFAULT_CREDENTIALS);
  }
}

/**
 * Write credentials to ~/.tinker-launch/credentials.yaml
 */
export async function writeCredentials(credentials: Credentials): Promise<void> {
  await ensureCredentialsDir();
  const credPath = getCredentialsPath();
  await writeSecretFile(credPath, YAML.stringify(credentials));
}

/**
 * Get the account key for a given org
 */
export function getAccountForOrg(
  credentials: Credentials,
  org: string
): string | undefined {
  return credentials.org_mapping[org];
}

/**
 * Get account details for a given account key
 */
export function getAccount(
  credentials: Credentials,
  accountKey: string
): Account | undefined {
  return credentials.accounts[accountKey];
}

/**
 * Get all unique orgs from org_mapping
 */
export function getOrgs(credentials: Credentials): string[] {
  return Object.keys(credentials.org_mapping);
}

/**
 * Get all account keys
 */
export function getAccountKeys(credentials: Credentials): string[] {
  return Object.keys(credentials.accounts);
}

/**
 * Get the git author info for a given org
 */
export function getGitAuthorForOrg(
  credentials: Credentials,
  org: string
): { name: string; email: string } | undefined {
  const accountKey = getAccountForOrg(credentials, org);
  if (!accountKey) return undefined;
  const account = getAccount(credentials, accountKey);
  if (!account?.git_email) return undefined;
  return {
    name: account.git_name || account.name,
    email: account.git_email,
  };
}

/**
 * Generate .envrc content for a given account and project-scoped credentials
 */
export function generateEnvrcContent(
  account: Account,
  convexKeys?: ConvexKeys,
  linearKey?: string,
  neonKey?: string,
  openRouterKey?: string
): string {
  let content = `# Tinker Launch generated credentials
# Account: ${account.name}
# DO NOT commit this file to git

export VERCEL_TOKEN="${account.vercel_token}"
`;

  if (convexKeys?.production) {
    content += `export CONVEX_DEPLOY_KEY="${convexKeys.production}"
`;
  }

  if (convexKeys?.preview) {
    content += `export CONVEX_DEPLOY_KEY_PREVIEW="${convexKeys.preview}"
`;
  }

  if (convexKeys?.dev) {
    content += `export CONVEX_DEPLOY_KEY_DEV="${convexKeys.dev}"
`;
  }

  if (linearKey) {
    content += `export LINEAR_API_KEY="${linearKey}"
`;
  }

  if (neonKey) {
    content += `export NEON_API_KEY="${neonKey}"
`;
  }

  if (openRouterKey) {
    content += `export OPENROUTER_API_KEY="${openRouterKey}"
`;
  }

  return content;
}

/**
 * Get Linear API key for a workspace slug
 */
export function getLinearKey(
  credentials: Credentials,
  linearSlug: string
): string | undefined {
  return credentials.linear_keys?.[linearSlug];
}

/**
 * Set Linear API key for a workspace slug
 */
export async function setLinearKey(
  linearSlug: string,
  apiKey: string
): Promise<void> {
  const credentials = await readCredentials();
  if (!credentials.linear_keys) credentials.linear_keys = {};
  credentials.linear_keys[linearSlug] = apiKey;
  await writeCredentials(credentials);
}

/**
 * Delete Linear API key for a workspace slug
 */
export async function deleteLinearKey(linearSlug: string): Promise<void> {
  const credentials = await readCredentials();
  if (credentials.linear_keys) {
    delete credentials.linear_keys[linearSlug];
    await writeCredentials(credentials);
  }
}

/**
 * Get Convex keys for a specific project
 */
export function getConvexKeys(
  credentials: Credentials,
  repoName: string
): ConvexKeys | undefined {
  return credentials.convex_keys[repoName];
}

/**
 * Set Convex keys for a specific project
 */
export async function setConvexKeys(
  repoName: string,
  keys: ConvexKeys
): Promise<void> {
  const credentials = await readCredentials();
  credentials.convex_keys[repoName] = keys;
  await writeCredentials(credentials);
}

/**
 * Delete Convex keys for a specific project
 */
export async function deleteConvexKeys(repoName: string): Promise<void> {
  const credentials = await readCredentials();
  delete credentials.convex_keys[repoName];
  await writeCredentials(credentials);
}

/**
 * Get Neon API key for an org slug
 */
export function getNeonKey(
  credentials: Credentials,
  neonOrgSlug: string
): string | undefined {
  return credentials.neon_keys?.[neonOrgSlug];
}

/**
 * Set Neon API key for an org slug
 */
export async function setNeonKey(
  neonOrgSlug: string,
  apiKey: string
): Promise<void> {
  const credentials = await readCredentials();
  if (!credentials.neon_keys) credentials.neon_keys = {};
  credentials.neon_keys[neonOrgSlug] = apiKey;
  await writeCredentials(credentials);
}

/**
 * Delete Neon API key for an org slug
 */
export async function deleteNeonKey(neonOrgSlug: string): Promise<void> {
  const credentials = await readCredentials();
  if (credentials.neon_keys) {
    delete credentials.neon_keys[neonOrgSlug];
    await writeCredentials(credentials);
  }
}

/**
 * Get the OpenRouter inference key (secret) for a project, if one was minted here.
 * Tracking-only links have no secret and return undefined.
 */
export function getOpenRouterKey(
  credentials: Credentials,
  repoName: string
): string | undefined {
  return credentials.openrouter?.project_keys?.[repoName]?.key || undefined;
}

/**
 * Get the full OpenRouter key record (hash, workspace, optional secret) for a project
 */
export function getOpenRouterProjectKey(
  credentials: Credentials,
  repoName: string
): OpenRouterProjectKey | undefined {
  return credentials.openrouter?.project_keys?.[repoName];
}

/**
 * Set (add or replace) the OpenRouter key record for a project
 */
export async function setOpenRouterProjectKey(
  repoName: string,
  record: OpenRouterProjectKey
): Promise<Credentials> {
  const credentials = await readCredentials();
  credentials.openrouter.project_keys[repoName] = record;
  await writeCredentials(credentials);
  return credentials;
}

/**
 * Remove the OpenRouter key record for a project (does NOT revoke it on OpenRouter)
 */
export async function deleteOpenRouterProjectKey(repoName: string): Promise<Credentials> {
  const credentials = await readCredentials();
  delete credentials.openrouter.project_keys[repoName];
  await writeCredentials(credentials);
  return credentials;
}

/**
 * Set or clear (undefined) the OpenRouter management key
 */
export async function setOpenRouterManagementKey(key: string | undefined): Promise<void> {
  const credentials = await readCredentials();
  if (key) credentials.openrouter.management_key = key;
  else delete credentials.openrouter.management_key;
  await writeCredentials(credentials);
}

/**
 * Map a Tinker org to its default OpenRouter workspace (null clears the mapping)
 */
export async function setOpenRouterOrgWorkspace(
  org: string,
  workspaceId: string | null
): Promise<void> {
  const credentials = await readCredentials();
  if (workspaceId) credentials.openrouter.org_workspaces[org] = workspaceId;
  else delete credentials.openrouter.org_workspaces[org];
  await writeCredentials(credentials);
}

/**
 * Generate cli.sh content
 */
export function generateCliShContent(): string {
  return `#!/bin/bash
# Tinker Launch CLI wrapper
# Sources .envrc and executes the provided command with those environment variables

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/.envrc"

# Vercel CLI requires explicit --token flag (doesn't use VERCEL_TOKEN env var)
if [[ "$1" == "vercel" ]]; then
  shift
  exec vercel --token "$VERCEL_TOKEN" "$@"
fi

exec "$@"
`;
}

/**
 * Mask a token for display (show first 4 and last 4 chars)
 */
export function maskToken(token: string): string {
  if (!token || token.length < 12) {
    return token ? "****" : "";
  }
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

/**
 * Get credentials with masked tokens for API response
 */
export function getMaskedCredentials(credentials: Credentials): Credentials {
  const masked: Credentials = {
    accounts: {},
    org_mapping: { ...credentials.org_mapping },
    convex_keys: {},
    linear_keys: {},
    neon_keys: {},
    openrouter: {
      org_workspaces: { ...(credentials.openrouter?.org_workspaces || {}) },
      project_keys: {},
    },
  };

  for (const [key, account] of Object.entries(credentials.accounts)) {
    masked.accounts[key] = {
      name: account.name,
      vercel_token: maskToken(account.vercel_token),
      git_email: account.git_email,
      git_name: account.git_name,
    };
  }

  for (const [repoName, keys] of Object.entries(credentials.convex_keys)) {
    masked.convex_keys[repoName] = {
      production: keys.production ? maskToken(keys.production) : undefined,
      preview: keys.preview ? maskToken(keys.preview) : undefined,
      dev: keys.dev ? maskToken(keys.dev) : undefined,
    };
  }

  for (const [slug, key] of Object.entries(credentials.linear_keys || {})) {
    masked.linear_keys[slug] = maskToken(key);
  }

  for (const [slug, key] of Object.entries(credentials.neon_keys || {})) {
    masked.neon_keys[slug] = maskToken(key);
  }

  if (credentials.openrouter?.management_key) {
    masked.openrouter.management_key = maskToken(credentials.openrouter.management_key);
  }
  for (const [repoName, rec] of Object.entries(credentials.openrouter?.project_keys || {})) {
    const { key, ...rest } = rec;
    masked.openrouter.project_keys[repoName] = key ? { ...rest, key: maskToken(key) } : rest;
  }

  return masked;
}

/**
 * Add a new account
 */
export async function addAccount(
  accountKey: string,
  account: Account
): Promise<void> {
  const credentials = await readCredentials();
  credentials.accounts[accountKey] = account;
  await writeCredentials(credentials);
}

/**
 * Update an existing account
 */
export async function updateAccount(
  accountKey: string,
  updates: Partial<Account>
): Promise<void> {
  const credentials = await readCredentials();
  if (credentials.accounts[accountKey]) {
    credentials.accounts[accountKey] = {
      ...credentials.accounts[accountKey],
      ...updates,
    };
    await writeCredentials(credentials);
  }
}

/**
 * Delete an account
 */
export async function deleteAccount(accountKey: string): Promise<void> {
  const credentials = await readCredentials();
  delete credentials.accounts[accountKey];
  // Also remove from org mappings
  for (const [org, account] of Object.entries(credentials.org_mapping)) {
    if (account === accountKey) {
      delete credentials.org_mapping[org];
    }
  }
  await writeCredentials(credentials);
}

/**
 * Update org mapping
 */
export async function updateOrgMapping(
  org: string,
  accountKey: string
): Promise<void> {
  const credentials = await readCredentials();
  credentials.org_mapping[org] = accountKey;
  await writeCredentials(credentials);
}

/**
 * Add a new org
 */
export async function addOrg(org: string, accountKey: string): Promise<void> {
  const credentials = await readCredentials();
  credentials.org_mapping[org] = accountKey;
  await writeCredentials(credentials);
}

/**
 * Delete an org from mappings
 */
export async function deleteOrg(org: string): Promise<void> {
  const credentials = await readCredentials();
  delete credentials.org_mapping[org];
  await writeCredentials(credentials);
}

/**
 * Regenerate the .envrc file for a project if it exists.
 * Returns true if the file was regenerated, false if skipped.
 */
export async function regenerateEnvrcForProject(
  credentials: Credentials,
  repoName: string,
  projectPath: string,
  org: string,
  linearSlug?: string,
  neonOrgSlug?: string
): Promise<{ regenerated: boolean; reason?: string }> {
  const envrcPath = path.join(projectPath, ".envrc");

  // Find the account for this project's org
  const accountKey = getAccountForOrg(credentials, org);
  if (!accountKey) {
    return { regenerated: false, reason: `no account mapped for org "${org}"` };
  }

  const account = getAccount(credentials, accountKey);
  if (!account) {
    return { regenerated: false, reason: `account "${accountKey}" not found` };
  }

  const convexKeys = getConvexKeys(credentials, repoName);
  const linearKey = linearSlug ? getLinearKey(credentials, linearSlug) : undefined;
  const neonKey = neonOrgSlug ? getNeonKey(credentials, neonOrgSlug) : undefined;
  const openRouterKey = getOpenRouterKey(credentials, repoName);
  const envrcContent = generateEnvrcContent(account, convexKeys, linearKey, neonKey, openRouterKey);
  await writeEnvrc(envrcPath, envrcContent);

  return { regenerated: true };
}
