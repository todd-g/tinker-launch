import { readFile, writeFile, mkdir } from "fs/promises";
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

export interface Credentials {
  accounts: Record<string, Account>;
  org_mapping: Record<string, string>;
  convex_keys: Record<string, ConvexKeys>;  // keyed by repo name
  linear_keys: Record<string, string>;      // keyed by Linear workspace slug
  neon_keys: Record<string, string>;        // keyed by Neon org slug (free-form identifier)
}

// Default credentials structure
const DEFAULT_CREDENTIALS: Credentials = {
  accounts: {},
  org_mapping: {},
  convex_keys: {},
  linear_keys: {},
  neon_keys: {},
};

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
    await mkdir(dir, { recursive: true });
  }
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
      await writeFile(credPath, YAML.stringify(DEFAULT_CREDENTIALS));
      return DEFAULT_CREDENTIALS;
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
    };
  } catch (error) {
    console.error("Error reading credentials:", error);
    return DEFAULT_CREDENTIALS;
  }
}

/**
 * Write credentials to ~/.tinker-launch/credentials.yaml
 */
export async function writeCredentials(credentials: Credentials): Promise<void> {
  await ensureCredentialsDir();
  const credPath = getCredentialsPath();
  await writeFile(credPath, YAML.stringify(credentials));
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
  neonKey?: string
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
  const envrcContent = generateEnvrcContent(account, convexKeys, linearKey, neonKey);
  await writeFile(envrcPath, envrcContent);

  return { regenerated: true };
}
