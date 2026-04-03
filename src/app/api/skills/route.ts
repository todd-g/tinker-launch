import { NextResponse } from "next/server";
import { existsSync } from "fs";
import {
  scanAllSkills,
  getSkillById,
  writeSkill,
  deleteSkill,
  computeSkillPath,
  migrateCommandToSkill,
} from "@/lib/skills";
import type { SkillFrontmatter } from "@/lib/skills";
import { projects } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const scope = searchParams.get("scope") as "personal" | "project" | null;
    const type = searchParams.get("type") as "skill" | "command" | null;
    const projectId = searchParams.get("projectId");

    // Single skill by ID
    if (id) {
      const skill = await getSkillById(id);
      return NextResponse.json({ success: true, skill: skill || null });
    }

    // Full scan with optional filters
    let skills = await scanAllSkills();

    if (scope) {
      skills = skills.filter((s) => s.scope === scope);
    }
    if (type) {
      skills = skills.filter((s) => s.type === type);
    }
    if (projectId) {
      skills = skills.filter((s) => s.projectId === projectId);
    }

    return NextResponse.json({ success: true, skills, count: skills.length });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "create") {
      const { scope, type, name, frontmatter, content, projectId } = body as {
        scope: "personal" | "project";
        type: "skill" | "command";
        name: string;
        frontmatter: SkillFrontmatter;
        content: string;
        projectId?: string;
      };

      let projectPath: string | undefined;
      if (scope === "project") {
        if (!projectId) {
          return NextResponse.json(
            { success: false, error: "projectId required for project-scoped skills" },
            { status: 400 }
          );
        }
        const project = projects.get(projectId);
        if (!project) {
          return NextResponse.json(
            { success: false, error: "Project not found" },
            { status: 404 }
          );
        }
        projectPath = project.localPath;
      }

      const filePath = computeSkillPath(scope, type, name, projectPath);

      if (existsSync(filePath)) {
        return NextResponse.json(
          { success: false, error: `A ${type} named "${name}" already exists at this scope` },
          { status: 409 }
        );
      }

      // Ensure name is in the frontmatter
      const fm = { ...frontmatter, name };
      await writeSkill(filePath, fm, content);

      return NextResponse.json({ success: true, filePath });
    }

    if (action === "update") {
      const { filePath, frontmatter, content } = body as {
        filePath: string;
        frontmatter: SkillFrontmatter;
        content: string;
      };

      if (!existsSync(filePath)) {
        return NextResponse.json(
          { success: false, error: "Skill file not found" },
          { status: 404 }
        );
      }

      await writeSkill(filePath, frontmatter, content);
      return NextResponse.json({ success: true });
    }

    if (action === "delete") {
      const { filePath } = body as { filePath: string };

      if (!existsSync(filePath)) {
        return NextResponse.json(
          { success: false, error: "Skill file not found" },
          { status: 404 }
        );
      }

      await deleteSkill(filePath);
      return NextResponse.json({ success: true });
    }

    if (action === "migrate") {
      const { filePath, disableModelInvocation, description } = body as {
        filePath: string;
        disableModelInvocation?: boolean;
        description?: string;
      };

      if (!existsSync(filePath)) {
        return NextResponse.json(
          { success: false, error: "Command file not found" },
          { status: 404 }
        );
      }

      const result = await migrateCommandToSkill(filePath, {
        disableModelInvocation,
        description,
      });

      return NextResponse.json({ success: true, migration: result });
    }

    if (action === "migrateBulk") {
      const { filePaths, disableModelInvocation } = body as {
        filePaths: string[];
        disableModelInvocation?: boolean;
      };

      const results = [];
      const errors = [];

      for (const fp of filePaths) {
        try {
          if (!existsSync(fp)) {
            errors.push({ filePath: fp, error: "File not found" });
            continue;
          }
          const result = await migrateCommandToSkill(fp, { disableModelInvocation });
          results.push(result);
        } catch (e) {
          errors.push({ filePath: fp, error: String(e) });
        }
      }

      return NextResponse.json({
        success: true,
        migrated: results,
        errors,
        migratedCount: results.length,
        errorCount: errors.length,
      });
    }

    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
