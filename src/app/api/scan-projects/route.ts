import { NextResponse } from "next/server";
import { readdir, stat, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { getProjectGitInfo } from "@/lib/github";
import YAML from "yaml";

const PROJECTS_BASE_DIR = process.env.PROJECTS_DIR || `${process.env.HOME}/Documents/GitHub`;

interface ScannedProject {
  localPath: string;
  folderName: string;
  org: string | null;
  repo: string | null;
  githubUrl: string | null;
  hasTinkerYaml: boolean;
  tinkerConfig: {
    name?: string;
    description?: string;
    port?: number;
  } | null;
}

/**
 * GET /api/scan-projects
 * Scan ~/Documents/GitHub for projects and return git info
 */
export async function GET() {
  try {
    if (!existsSync(PROJECTS_BASE_DIR)) {
      return NextResponse.json({
        success: false,
        error: `Projects directory not found: ${PROJECTS_BASE_DIR}`,
      });
    }

    const entries = await readdir(PROJECTS_BASE_DIR, { withFileTypes: true });
    const projects: ScannedProject[] = [];

    for (const entry of entries) {
      // Skip non-directories and hidden folders
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue;
      }

      const localPath = path.join(PROJECTS_BASE_DIR, entry.name);

      // Check if it's a git repo
      const gitDir = path.join(localPath, ".git");
      if (!existsSync(gitDir)) {
        continue;
      }

      // Get git remote info
      const gitInfo = await getProjectGitInfo(localPath);

      // Check for .tinker.yaml
      const tinkerYamlPath = path.join(localPath, ".tinker.yaml");
      let hasTinkerYaml = false;
      let tinkerConfig: ScannedProject["tinkerConfig"] = null;

      if (existsSync(tinkerYamlPath)) {
        hasTinkerYaml = true;
        try {
          const content = await readFile(tinkerYamlPath, "utf-8");
          const parsed = YAML.parse(content);
          tinkerConfig = {
            name: parsed.name,
            description: parsed.description,
            port: parsed.port,
          };
        } catch {
          // Ignore parse errors
        }
      }

      projects.push({
        localPath,
        folderName: entry.name,
        org: gitInfo?.org || null,
        repo: gitInfo?.repo || null,
        githubUrl: gitInfo ? `https://github.com/${gitInfo.org}/${gitInfo.repo}` : null,
        hasTinkerYaml,
        tinkerConfig,
      });
    }

    // Sort by folder name
    projects.sort((a, b) => a.folderName.localeCompare(b.folderName));

    return NextResponse.json({
      success: true,
      baseDir: PROJECTS_BASE_DIR,
      projects,
      count: projects.length,
    });
  } catch (error) {
    console.error("Error scanning projects:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to scan projects",
      },
      { status: 500 }
    );
  }
}
