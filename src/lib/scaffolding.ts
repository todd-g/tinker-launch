import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export interface ProjectConfig {
  repoName: string;
  projectName: string;
  org: string;
  description: string;
  port: number;
  gitAuthor?: { name: string; email: string };
}

const PROJECTS_BASE_DIR = process.env.PROJECTS_DIR || `${process.env.HOME}/Documents/GitHub`;

/**
 * Get the local path for a project
 */
export function getProjectPath(repoName: string): string {
  return path.join(PROJECTS_BASE_DIR, repoName);
}

/**
 * Generate CLAUDE.md content
 */
function generateClaudeMd(config: ProjectConfig): string {
  let content = `# ${config.projectName}

${config.description}

## Tech Stack
@TECH_STACK.md

## Development
- Run \`npm run dev\` for Next.js dev server
- Run \`npx convex dev\` for Convex in development mode
- Local dev server runs on port ${config.port} (the \`dev\` script pins \`-p ${config.port}\`)
- Deploy with the Vercel and Convex CLIs — through \`./cli.sh\` when it exists (see Deployments & Credentials)

## Working Agreement

**Autonomy.** Once we've agreed on a plan or task list, execute it to completion without checking in. Don't stop to ask "should I continue?" between items. Only stop for: (1) destructive or production-facing actions — deploys, deletes, migrations, anything touching prod data; (2) a genuine fork where my answer changes what you'd build; (3) being truly blocked. New ideas I mention mid-run go onto the task list, not into an immediate detour.

**Transient errors.** On rate limits, overloads, or 5xx errors from any API or tool, wait and retry up to 3 times before stopping. Never end a work session over a transient infrastructure error without retrying.

**Approach visibility.** When starting a feature or refactor, state your approach in <=3 lines as you begin — what you'll reuse vs. create, and what existing behavior must not change — then proceed immediately. This is not a request for approval; do not wait for a reply. It exists so I can interrupt early if the approach is wrong. Prefer extending existing components over duplicating them.

**UI self-verification.** After visual changes, check your own rendered output (screenshot or inspect: one content width, one type scale, semantic colors correct, new controls actually visible on the target page) and fix what you find before showing me. Don't present UI work, or ask me to look, until your own check passes.
`;

  if (config.gitAuthor) {
    content += `
## Git Author

When committing to this repo, always use:
\`\`\`
git commit --author="${config.gitAuthor.name} <${config.gitAuthor.email}>"
\`\`\`

Or set locally:
\`\`\`
git config user.email "${config.gitAuthor.email}"
git config user.name "${config.gitAuthor.name}"
\`\`\`
`;
  }

  return content;
}

/**
 * Generate TECH_STACK.md content
 */
function generateTechStackMd(config: ProjectConfig): string {
  return `# Tech Stack

Always install the latest stable release of every package (\`@latest\`). Never pin a version from memory.

## Frontend
- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui with sidebar-08 layout

## Backend
- **Database & Functions**: Convex
- **Real-time**: Convex subscriptions

## Infrastructure
- **Hosting**: Vercel
- **CLI Tools**: Vercel CLI, Convex CLI

## Development Setup
1. \`npm install\`
2. \`npx convex dev\` (in separate terminal)
3. \`npm run dev\` — the \`dev\` script must be \`next dev -p ${config.port}\` so it matches \`.tinker.yaml\`
4. Open \`http://localhost:${config.port}\`
`;
}

/**
 * Generate .tinker.yaml content with helpful instructions
 */
function generateTinkerYaml(config: ProjectConfig): string {
  return `# Tinker Launch Project Configuration
# =====================================
# IMPORTANT: This file must be named exactly ".tinker.yaml" (with the leading dot)
# and placed in the project root directory.
#
# This file helps Tinker Launch identify your project in the port registry.
# The port scanner reads this file to display project info in the dashboard.
#
# Instructions for AI agents:
# 1. Create this file as ".tinker.yaml" in the project root (not "tinker.yaml" or "tinker-launch.yaml")
# 2. Fill in the fields below:
#    - name: Human-readable project name (e.g., "My Awesome App")
#    - description: Brief one-line description of the project
#    - port: The localhost port this project runs on (must match your dev server config)
#    - org: GitHub org or username (e.g., "your-username" or "your-org")
#    - repo: GitHub repository name
#
# Example:
#   name: My Awesome App
#   description: A dashboard for managing widgets
#   port: 3001
#   org: your-username
#   repo: my-awesome-app

name: ${config.projectName}
description: ${config.description}
port: ${config.port}
org: ${config.org}
repo: ${config.repoName}
`;
}

/**
 * Generate .gitignore content
 */
function generateGitignore(): string {
  return `# Dependencies
node_modules/
.pnp/
.pnp.js

# Next.js
.next/
out/

# Convex
.convex/

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Vercel
.vercel

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
`;
}

/**
 * Create project directory with default files
 */
export async function scaffoldProject(config: ProjectConfig): Promise<{ success: boolean; localPath: string; error?: string }> {
  const localPath = getProjectPath(config.repoName);

  try {
    // Check if directory already exists
    if (existsSync(localPath)) {
      return { success: false, localPath, error: "Directory already exists" };
    }

    // Create directory
    await mkdir(localPath, { recursive: true });

    // Write default files
    await writeFile(path.join(localPath, "CLAUDE.md"), generateClaudeMd(config));
    await writeFile(path.join(localPath, "TECH_STACK.md"), generateTechStackMd(config));
    await writeFile(path.join(localPath, ".gitignore"), generateGitignore());
    await writeFile(path.join(localPath, ".tinker.yaml"), generateTinkerYaml(config));

    return { success: true, localPath };
  } catch (error) {
    return {
      success: false,
      localPath,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
