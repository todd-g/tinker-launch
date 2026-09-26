import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type GitHubOrg = string;

// GitHub owner/repo names are limited to this charset; enforcing it also keeps
// the values safe to use as CLI args and path segments.
const GITHUB_NAME_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Throw if org or repoName isn't a plain GitHub name (letters, digits, . _ -)
 */
export function assertValidGitHubNames(org: string, repoName: string): void {
  for (const [label, value] of [["org", org], ["repoName", repoName]] as const) {
    if (typeof value !== "string" || !GITHUB_NAME_RE.test(value) || value.startsWith("-") || value === "." || value === "..") {
      throw new Error(`Invalid ${label} "${value}": only letters, digits, ".", "_" and "-" are allowed`);
    }
  }
}

export interface CreateRepoOptions {
  repoName: string;
  org: GitHubOrg;
  description: string;
  isPrivate?: boolean;
}

export interface CreateRepoResult {
  success: boolean;
  githubUrl?: string;
  error?: string;
}

/**
 * Create a new GitHub repository using gh CLI
 */
export async function createGitHubRepo(options: CreateRepoOptions): Promise<CreateRepoResult> {
  const { repoName, org, description, isPrivate = true } = options;
  assertValidGitHubNames(org, repoName);
  const visibility = isPrivate ? "--private" : "--public";
  const fullName = `${org}/${repoName}`;

  try {
    await execFileAsync("gh", ["repo", "create", fullName, visibility, `--description=${description}`]);
    return {
      success: true,
      githubUrl: `https://github.com/${fullName}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Initialize git in a directory and add remote
 */
export async function initGitRepo(localPath: string, githubUrl: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["init"], { cwd: localPath });
    await execFileAsync("git", ["remote", "add", "origin", `${githubUrl}.git`], { cwd: localPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if gh CLI is authenticated
 */
export async function isGhAuthenticated(): Promise<boolean> {
  try {
    await execFileAsync("gh", ["auth", "status"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the org/owner from a git remote URL
 * Supports both HTTPS and SSH formats:
 * - https://github.com/owner/repo.git
 * - git@github.com:owner/repo.git
 */
export function parseGitRemoteOrg(remoteUrl: string): string | null {
  // HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\//);
  if (httpsMatch) {
    return httpsMatch[1];
  }

  // SSH format: git@github.com:owner/repo.git
  const sshMatch = remoteUrl.match(/github\.com:([^/]+)\//);
  if (sshMatch) {
    return sshMatch[1];
  }

  return null;
}

/**
 * Get the repo name from a git remote URL
 */
export function parseGitRemoteRepo(remoteUrl: string): string | null {
  // Match repo name (without .git extension)
  const match = remoteUrl.match(/\/([^/]+?)(\.git)?$/);
  if (match) {
    return match[1];
  }
  return null;
}

/**
 * Get the git remote origin URL for a directory
 */
export async function getGitRemoteUrl(localPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: localPath });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get the org from a project's git remote
 */
export async function getProjectOrg(localPath: string): Promise<string | null> {
  const remoteUrl = await getGitRemoteUrl(localPath);
  if (!remoteUrl) return null;
  return parseGitRemoteOrg(remoteUrl);
}

/**
 * Get both org and repo name from a project's git remote
 */
export async function getProjectGitInfo(localPath: string): Promise<{ org: string; repo: string } | null> {
  const remoteUrl = await getGitRemoteUrl(localPath);
  if (!remoteUrl) return null;

  const org = parseGitRemoteOrg(remoteUrl);
  const repo = parseGitRemoteRepo(remoteUrl);

  if (org && repo) {
    return { org, repo };
  }
  return null;
}
