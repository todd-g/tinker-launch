import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export interface ProjectConfig {
  repoName: string;
  projectName: string;
  description: string;
  port: number;
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
  return `# ${config.projectName}

${config.description}

## Tech Stack
- Next.js (latest stable, App Router)
- Tailwind CSS 4 with shadcn/ui (sidebar-08 variant)
- Convex for database/backend
- Vercel for hosting
- Use Vercel CLI and Convex CLI for all deployments

## Development
- Run \`npm run dev\` for Next.js dev server
- Run \`npx convex dev\` for Convex in development mode
- Local dev server runs on port ${config.port}

## Commands
- \`vercel\` - Deploy to Vercel
- \`npx convex deploy\` - Deploy Convex functions
`;
}

/**
 * Generate TECH_STACK.md content
 */
function generateTechStackMd(config: ProjectConfig): string {
  return `# Tech Stack

## Frontend
- **Framework**: Next.js (latest stable, App Router)
- **Styling**: Tailwind CSS 4
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
3. \`npm run dev\`
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
#    - org: GitHub org or username (e.g., "todd-g" or "minimagroup")
#    - repo: GitHub repository name
#
# Example:
#   name: My Awesome App
#   description: A dashboard for managing widgets
#   port: 3001
#   org: todd-g
#   repo: my-awesome-app

name: ${config.projectName}
description: ${config.description}
port: ${config.port}
org: todd-g
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
