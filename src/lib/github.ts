import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export type GitHubOrg = "todd-g" | "minimagroup";

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
