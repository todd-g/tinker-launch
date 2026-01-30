import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export type GitHubOrg = string;

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
  const visibility = isPrivate ? "--private" : "--public";
  const fullName = `${org}/${repoName}`;

  try {
    await execAsync(
      `gh repo create ${fullName} ${visibility} --description "${description.replace(/"/g, '\\"')}"`
    );
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
    await execAsync(`git init`, { cwd: localPath });
    await execAsync(`git remote add origin ${githubUrl}.git`, { cwd: localPath });
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
    await execAsync("gh auth status");
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
    const { stdout } = await execAsync("git remote get-url origin", { cwd: localPath });
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
