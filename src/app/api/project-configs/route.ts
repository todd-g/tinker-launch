import { NextResponse } from "next/server";
import { projects } from "@/lib/db";
import { findProjectFavicon } from "@/lib/favicon";
import { existsSync, readFileSync } from "fs";
import path from "path";

interface ProjectConfig {
  color?: string;
  favicon?: string;
}

function readTinkerColor(projectDir: string): string | null {
  const yamlNames = [".tinker.yaml", ".tinker-launch.yaml", "tinker.yaml"];
  for (const name of yamlNames) {
    const yamlPath = path.join(projectDir, name);
    if (!existsSync(yamlPath)) continue;
    try {
      const content = readFileSync(yamlPath, "utf-8");
      // Extract terminal dark color (preferred) or background
      const darkMatch = content.match(/dark:\s*"([^"]+)"/);
      if (darkMatch) return darkMatch[1];
      const bgMatch = content.match(/background:\s*"([^"]+)"/);
      if (bgMatch) return bgMatch[1];
    } catch {
      continue;
    }
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
      const color = readTinkerColor(proj.localPath);
      if (color) config.color = color;
      const favicon = findProjectFavicon(proj.localPath);
      if (favicon) config.favicon = favicon;
      if (color || favicon) configs[proj.id] = config;
    }

    return NextResponse.json({ success: true, configs });
  } catch (error) {
    console.error("Project configs error:", error);
    return NextResponse.json({ success: false, error: "Failed to read configs" }, { status: 500 });
  }
}
