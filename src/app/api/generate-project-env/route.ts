import { NextResponse } from "next/server";
import { writeFile, readFile, appendFile, chmod } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import {
  readCredentials,
  getAccountForOrg,
  getAccount,
  getConvexKeys,
  generateEnvrcContent,
  generateCliShContent,
} from "@/lib/credentials";
import { getProjectGitInfo } from "@/lib/github";

/**
 * POST /api/generate-project-env
 * Generate .envrc and cli.sh files for a project
 *
 * Body:
 * - projectPath: string - Path to the project directory
 * - repoName?: string - Repo name for looking up Convex keys (optional, will auto-detect from git or folder name)
 * - accountKey?: string - Override account key (optional, will use org_mapping if not provided)
 * - org?: string - Org to lookup account from org_mapping (required if accountKey not provided)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectPath, repoName: providedRepoName, accountKey: providedAccountKey, org } = body;

    if (!projectPath) {
      return NextResponse.json(
        { success: false, error: "projectPath is required" },
        { status: 400 }
      );
    }

    if (!existsSync(projectPath)) {
      return NextResponse.json(
        { success: false, error: `Project path does not exist: ${projectPath}` },
        { status: 400 }
      );
    }

    const credentials = await readCredentials();

    // Determine the org and repo name - use provided values, or auto-detect from git remote
    let resolvedOrg = org;
    let repoName = providedRepoName;

    if (!resolvedOrg || !repoName) {
      const gitInfo = await getProjectGitInfo(projectPath);
      if (gitInfo) {
        if (!resolvedOrg) resolvedOrg = gitInfo.org;
        if (!repoName) repoName = gitInfo.repo;
      }
    }

    // Fallback to folder name for repo if still not found
    if (!repoName) {
      repoName = path.basename(projectPath);
    }

    // Determine which account to use
    let accountKey = providedAccountKey;
    if (!accountKey && resolvedOrg) {
      accountKey = getAccountForOrg(credentials, resolvedOrg);
    }

    if (!accountKey) {
      const orgInfo = resolvedOrg ? ` (detected org: ${resolvedOrg})` : " (could not detect org from git)";
      return NextResponse.json(
        { success: false, error: `Could not determine account${orgInfo}. Check org mappings in Settings > Credentials.` },
        { status: 400 }
      );
    }

    const account = getAccount(credentials, accountKey);
    if (!account) {
      return NextResponse.json(
        { success: false, error: `Account not found: ${accountKey}` },
        { status: 400 }
      );
    }

    // Get project-specific Convex keys
    const convexKeys = getConvexKeys(credentials, repoName);

    // Check if at least Vercel token is configured
    if (!account.vercel_token) {
      return NextResponse.json(
        {
          success: false,
          error: `Account "${account.name}" has no Vercel token configured. Add token in Settings > Credentials.`
        },
        { status: 400 }
      );
    }

    const envrcPath = path.join(projectPath, ".envrc");
    const cliShPath = path.join(projectPath, "cli.sh");
    const gitignorePath = path.join(projectPath, ".gitignore");

    // Generate .envrc with account's Vercel token and project's Convex keys
    const envrcContent = generateEnvrcContent(account, convexKeys);
    await writeFile(envrcPath, envrcContent);

    // Generate cli.sh
    const cliShContent = generateCliShContent();
    await writeFile(cliShPath, cliShContent);
    await chmod(cliShPath, 0o755);

    // Update .gitignore to include .envrc if not already present
    let gitignoreUpdated = false;
    if (existsSync(gitignorePath)) {
      const gitignoreContent = await readFile(gitignorePath, "utf-8");
      if (!gitignoreContent.includes(".envrc")) {
        await appendFile(gitignorePath, "\n# Tinker Launch credentials\n.envrc\n");
        gitignoreUpdated = true;
      }
    } else {
      // Create .gitignore with .envrc
      await writeFile(gitignorePath, "# Tinker Launch credentials\n.envrc\n");
      gitignoreUpdated = true;
    }

    // Update CLAUDE.md with credentials section if it exists and doesn't have it
    const claudeMdPath = path.join(projectPath, "CLAUDE.md");
    let claudeMdUpdated = false;
    if (existsSync(claudeMdPath)) {
      const claudeMdContent = await readFile(claudeMdPath, "utf-8");
      if (!claudeMdContent.includes("## Deployments & Credentials")) {
        const credentialsSection = `

## Deployments & Credentials

This project uses credential files managed by Tinker Launch. The \`.envrc\` file contains environment variables for Vercel and Convex authentication.

**Using cli.sh (recommended for agents):**
\`\`\`bash
./cli.sh vercel              # Deploy to Vercel
./cli.sh npx convex deploy   # Deploy Convex functions
./cli.sh vercel whoami       # Check which Vercel account is active
\`\`\`

**If direnv is installed:**
The credentials auto-load when you \`cd\` into this directory. You can then run commands directly:
\`\`\`bash
vercel
npx convex deploy
\`\`\`

**Important:** Never commit \`.envrc\` - it contains sensitive tokens and is gitignored.
`;
        await appendFile(claudeMdPath, credentialsSection);
        claudeMdUpdated = true;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Generated credentials for ${account.name}`,
      repoName,
      hasConvexKeys: !!(convexKeys?.production || convexKeys?.preview),
      files: {
        envrc: envrcPath,
        cliSh: cliShPath,
        gitignoreUpdated,
        claudeMdUpdated,
      },
    });
  } catch (error) {
    console.error("Error generating project env:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate project env",
      },
      { status: 500 }
    );
  }
}
