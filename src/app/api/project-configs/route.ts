import { NextRequest, NextResponse } from "next/server";
import { projects } from "@/lib/db";
import { findProjectFavicon } from "@/lib/favicon";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

interface ProjectConfig {
  color?: string;
  darkColor?: string;
  lightColor?: string;
  favicon?: string;
}

interface TinkerColors {
  dark?: string;
  light?: string;
  background?: string;
}

function readTinkerColors(projectDir: string): TinkerColors | null {
  const yamlNames = [".tinker.yaml", ".tinker-launch.yaml", "tinker.yaml"];
  for (const name of yamlNames) {
    const yamlPath = path.join(projectDir, name);
    if (!existsSync(yamlPath)) continue;
    try {
      const content = readFileSync(yamlPath, "utf-8");
      const colors: TinkerColors = {};
      const darkMatch = content.match(/dark:\s*"([^"]+)"/);
      if (darkMatch) colors.dark = darkMatch[1];
      const lightMatch = content.match(/light:\s*"([^"]+)"/);
      if (lightMatch) colors.light = lightMatch[1];
      const bgMatch = content.match(/background:\s*"([^"]+)"/);
      if (bgMatch) colors.background = bgMatch[1];
      if (colors.dark || colors.light || colors.background) return colors;
    } catch {
      continue;
    }
  }
  return null;
}

function findTinkerYamlPath(projectDir: string): string | null {
  const yamlNames = [".tinker.yaml", ".tinker-launch.yaml", "tinker.yaml"];
  for (const name of yamlNames) {
    const yamlPath = path.join(projectDir, name);
    if (existsSync(yamlPath)) return yamlPath;
  }
  return null;
}

export async function GET() {
  try {
    const allProjects = projects.list();
    const configs: Record<string, ProjectConfig> = {};

    for (const proj of allProjects) {
      if (!proj.localPath || !existsSync(proj.localPath)) continue;
      const config: ProjectConfig = {};
      const colors = readTinkerColors(proj.localPath);
      if (colors) {
        config.color = colors.dark || colors.background;
        config.darkColor = colors.dark;
        config.lightColor = colors.light;
      }
      const favicon = findProjectFavicon(proj.localPath);
      if (favicon) config.favicon = favicon;
      if (config.color || favicon) configs[proj.id] = config;
    }

    return NextResponse.json({ success: true, configs });
  } catch (error) {
    console.error("Project configs error:", error);
    return NextResponse.json({ success: false, error: "Failed to read configs" }, { status: 500 });
  }
}

/**
 * POST /api/project-configs
 * Write terminal colors to a project's .tinker.yaml
 * Body: { projectId: string, darkColor: string, lightColor: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, darkColor, lightColor } = body;

    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId required" }, { status: 400 });
    }

    const project = projects.get(projectId);
    if (!project) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    if (!project.localPath || !existsSync(project.localPath)) {
      return NextResponse.json({ success: false, error: "Project directory not found" }, { status: 404 });
    }

    // Find existing yaml or create .tinker.yaml
    let yamlPath = findTinkerYamlPath(project.localPath);
    if (!yamlPath) {
      yamlPath = path.join(project.localPath, ".tinker.yaml");
    }

    let content = "";
    if (existsSync(yamlPath)) {
      content = readFileSync(yamlPath, "utf-8");
    }

    // Update or create terminal section with dark/light colors
    const newDark = darkColor ? `  dark: "${darkColor}"` : "";
    const newLight = lightColor ? `  light: "${lightColor}"` : "";
    const newTerminalBlock = [
      "terminal:",
      ...(newDark ? [newDark] : []),
      ...(newLight ? [newLight] : []),
    ].join("\n");

    if (content.includes("terminal:")) {
      // Replace the entire terminal section
      // Match terminal: followed by indented lines until next top-level key or EOF
      content = content.replace(
        /terminal:\n(?:[ \t]+[^\n]*\n?)*/,
        newTerminalBlock + "\n"
      );
    } else if (content) {
      // Append terminal section
      content = content.trimEnd() + "\n\n" + newTerminalBlock + "\n";
    } else {
      // New file — include project name
      const dirName = path.basename(project.localPath);
      const inferredName = dirName
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      content = `name: ${inferredName}\n\n${newTerminalBlock}\n`;
    }

    writeFileSync(yamlPath, content, "utf-8");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Project config write error:", error);
    return NextResponse.json({ success: false, error: "Failed to write config" }, { status: 500 });
  }
}
