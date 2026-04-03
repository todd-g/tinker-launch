import { readdir, readFile, stat, writeFile, unlink, rmdir } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import YAML from "yaml";
import { projects } from "@/lib/db";

// ── Types ──────────────────────────────────────────────────────────────

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  "disable-model-invocation"?: boolean;
  "user-invocable"?: boolean;
  "allowed-tools"?: string | string[];
  model?: string;
  effort?: string;
  context?: string;
  agent?: string;
  paths?: string | string[];
  hooks?: Record<string, unknown>;
  "argument-hint"?: string;
  shell?: string;
}

export interface ScannedSkill {
  id: string;
  name: string;
  description: string;
  filePath: string;
  scope: "personal" | "project";
  type: "skill" | "command";
  projectId: string | null;
  projectName: string | null;
  projectPath: string | null;
  frontmatter: SkillFrontmatter;
  content: string;
  lastModified: number;
  fileSize: number;
}

// ── Helpers ────────────────────────────────────────────────────────────

const CLAUDE_HOME = path.join(os.homedir(), ".claude");

function makeId(filePath: string): string {
  return crypto.createHash("md5").update(filePath).digest("hex");
}

/**
 * Parse a markdown file with optional YAML frontmatter.
 * Returns { frontmatter, content } or null if file can't be read.
 */
async function parseMarkdownWithFrontmatter(
  filePath: string
): Promise<{ frontmatter: SkillFrontmatter; content: string } | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (fmMatch) {
      let frontmatter: SkillFrontmatter = {};
      try {
        frontmatter = YAML.parse(fmMatch[1]) || {};
      } catch {
        // Bad YAML — treat as no frontmatter
      }
      return { frontmatter, content: fmMatch[2].trim() };
    }
    // No frontmatter — entire file is content
    return { frontmatter: {}, content: raw.trim() };
  } catch {
    return null;
  }
}

/**
 * Derive a skill name from a file path.
 * - SKILL.md → parent directory name
 * - foo.md → "foo"
 */
function deriveNameFromPath(filePath: string): string {
  const basename = path.basename(filePath, ".md");
  if (basename.toLowerCase() === "skill") {
    return path.basename(path.dirname(filePath));
  }
  return basename;
}

async function parseSkillFile(
  filePath: string,
  scope: "personal" | "project",
  type: "skill" | "command",
  projectId: string | null = null,
  projectName: string | null = null,
  projectPath: string | null = null
): Promise<ScannedSkill | null> {
  const parsed = await parseMarkdownWithFrontmatter(filePath);
  if (!parsed) return null;

  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    return null;
  }

  const name = parsed.frontmatter.name || deriveNameFromPath(filePath);

  return {
    id: makeId(filePath),
    name,
    description: parsed.frontmatter.description || "",
    filePath,
    scope,
    type,
    projectId,
    projectName,
    projectPath,
    frontmatter: parsed.frontmatter,
    content: parsed.content,
    lastModified: fileStat.mtimeMs,
    fileSize: fileStat.size,
  };
}

// ── Scanners ───────────────────────────────────────────────────────────

/**
 * Scan a directory for skills (SKILL.md in subdirs) or commands (.md files).
 */
async function scanSkillsDir(
  dir: string,
  scope: "personal" | "project",
  type: "skill" | "command",
  projectId: string | null = null,
  projectName: string | null = null,
  projectPath: string | null = null
): Promise<ScannedSkill[]> {
  if (!existsSync(dir)) return [];

  const results: ScannedSkill[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (type === "skill" && entry.isDirectory()) {
      // Look for SKILL.md inside subdirectory
      const skillFile = path.join(fullPath, "SKILL.md");
      if (existsSync(skillFile)) {
        const skill = await parseSkillFile(skillFile, scope, type, projectId, projectName, projectPath);
        if (skill) results.push(skill);
      }
      // Also check for nested skill directories (e.g., skills/frontend/component/SKILL.md)
      try {
        const subEntries = await readdir(fullPath, { withFileTypes: true });
        for (const sub of subEntries) {
          if (sub.isDirectory()) {
            const nestedSkillFile = path.join(fullPath, sub.name, "SKILL.md");
            if (existsSync(nestedSkillFile)) {
              const skill = await parseSkillFile(nestedSkillFile, scope, type, projectId, projectName, projectPath);
              if (skill) results.push(skill);
            }
          }
        }
      } catch {
        // ignore
      }
    } else if (type === "command" && entry.isFile() && entry.name.endsWith(".md")) {
      const skill = await parseSkillFile(fullPath, scope, type, projectId, projectName, projectPath);
      if (skill) results.push(skill);
    }
  }

  return results;
}

async function scanPersonalSkills(): Promise<ScannedSkill[]> {
  return scanSkillsDir(path.join(CLAUDE_HOME, "skills"), "personal", "skill");
}

async function scanPersonalCommands(): Promise<ScannedSkill[]> {
  return scanSkillsDir(path.join(CLAUDE_HOME, "commands"), "personal", "command");
}

async function scanProjectSkills(project: { id: string; projectName: string; localPath: string }): Promise<ScannedSkill[]> {
  if (!existsSync(project.localPath)) return [];
  return scanSkillsDir(
    path.join(project.localPath, ".claude", "skills"),
    "project", "skill",
    project.id, project.projectName, project.localPath
  );
}

async function scanProjectCommands(project: { id: string; projectName: string; localPath: string }): Promise<ScannedSkill[]> {
  if (!existsSync(project.localPath)) return [];
  return scanSkillsDir(
    path.join(project.localPath, ".claude", "commands"),
    "project", "command",
    project.id, project.projectName, project.localPath
  );
}

// ── Public API ─────────────────────────────────────────────────────────

export async function scanAllSkills(): Promise<ScannedSkill[]> {
  const allProjects = projects.list();

  const scanPromises = [
    scanPersonalSkills(),
    scanPersonalCommands(),
    ...allProjects.flatMap((p) => [
      scanProjectSkills(p),
      scanProjectCommands(p),
    ]),
  ];

  const results = await Promise.all(scanPromises);
  const all = results.flat();

  // Sort by lastModified descending
  all.sort((a, b) => b.lastModified - a.lastModified);

  return all;
}

export async function getSkillById(id: string): Promise<ScannedSkill | null> {
  const all = await scanAllSkills();
  return all.find((s) => s.id === id) || null;
}

/**
 * Compute the file path for a new skill/command.
 */
function computeNewPath(
  scope: "personal" | "project",
  type: "skill" | "command",
  name: string,
  projectPath?: string
): string {
  const base = scope === "personal"
    ? CLAUDE_HOME
    : path.join(projectPath!, ".claude");

  if (type === "skill") {
    return path.join(base, "skills", name, "SKILL.md");
  }
  return path.join(base, "commands", `${name}.md`);
}

export async function writeSkill(
  filePath: string,
  frontmatter: SkillFrontmatter,
  content: string
): Promise<void> {
  // Clean empty values from frontmatter
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value !== undefined && value !== "" && value !== null) {
      cleaned[key] = value;
    }
  }

  const yamlStr = Object.keys(cleaned).length > 0
    ? YAML.stringify(cleaned).trim()
    : "";

  const fileContent = yamlStr
    ? `---\n${yamlStr}\n---\n\n${content}`
    : content;

  mkdirSync(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, fileContent, "utf-8");
}

export async function deleteSkill(filePath: string): Promise<void> {
  await unlink(filePath);

  // If this was SKILL.md in a subdirectory, try to clean up the empty dir
  if (path.basename(filePath) === "SKILL.md") {
    const dir = path.dirname(filePath);
    try {
      const remaining = await readdir(dir);
      if (remaining.length === 0) {
        await rmdir(dir);
      }
    } catch {
      // ignore
    }
  }
}

export function computeSkillPath(
  scope: "personal" | "project",
  type: "skill" | "command",
  name: string,
  projectPath?: string
): string {
  return computeNewPath(scope, type, name, projectPath);
}

// ── Migration ──────────────────────────────────────────────────────────

/** Keywords in command names/content that suggest side effects */
const ACTION_KEYWORDS = [
  "deploy", "push", "commit", "release", "publish", "ship",
  "migrate", "delete", "remove", "destroy", "reset", "clean",
  "send", "post", "create", "run", "execute", "build", "install",
];

export interface MigrationResult {
  success: boolean;
  oldPath: string;
  newPath: string;
  name: string;
  warnings: string[];
  addedDisableModelInvocation: boolean;
}

/**
 * Detect if a command likely has side effects based on name and content.
 */
function looksLikeActionCommand(name: string, content: string): boolean {
  const lower = (name + " " + content.slice(0, 500)).toLowerCase();
  return ACTION_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Migrate a command (.claude/commands/foo.md) to a skill (.claude/skills/foo/SKILL.md).
 *
 * - Preserves all existing frontmatter
 * - Ensures `name` field exists
 * - Optionally adds `disable-model-invocation: true` for action commands
 * - Optionally sets a description
 * - Deletes the original command file
 */
export async function migrateCommandToSkill(
  commandPath: string,
  options: {
    disableModelInvocation?: boolean;
    description?: string;
  } = {}
): Promise<MigrationResult> {
  const warnings: string[] = [];

  // Parse the existing command
  const parsed = await parseMarkdownWithFrontmatter(commandPath);
  if (!parsed) {
    throw new Error(`Could not read command file: ${commandPath}`);
  }

  const name = parsed.frontmatter.name || deriveNameFromPath(commandPath);
  const contentLineCount = parsed.content.split("\n").length;

  // Compute new skill path: same parent (.claude/) but skills/name/SKILL.md
  const commandsDir = path.dirname(commandPath);
  const claudeDir = path.dirname(commandsDir);
  const newPath = path.join(claudeDir, "skills", name, "SKILL.md");

  // Check for conflicts
  if (existsSync(newPath)) {
    throw new Error(`Skill already exists at: ${newPath}`);
  }

  // Build updated frontmatter
  const fm: SkillFrontmatter = { ...parsed.frontmatter };
  fm.name = name;

  // Add description if provided or missing
  if (options.description) {
    fm.description = options.description;
  } else if (!fm.description) {
    warnings.push("No description set — Claude won't know when to auto-invoke this skill. Consider adding one.");
  }

  // Handle disable-model-invocation
  let addedDisableModelInvocation = false;
  if (options.disableModelInvocation !== undefined) {
    if (options.disableModelInvocation) {
      fm["disable-model-invocation"] = true;
      addedDisableModelInvocation = true;
    }
  } else if (!fm["disable-model-invocation"] && looksLikeActionCommand(name, parsed.content)) {
    fm["disable-model-invocation"] = true;
    addedDisableModelInvocation = true;
    warnings.push(`Auto-added disable-model-invocation: true — "${name}" looks like it has side effects.`);
  }

  // Warn about long content
  if (contentLineCount > 500) {
    warnings.push(
      `Content is ${contentLineCount} lines (recommended max: 500). Consider splitting into SKILL.md + supporting files.`
    );
  }

  // Write the new skill file
  await writeSkill(newPath, fm, parsed.content);

  // Delete the old command file
  await unlink(commandPath);

  return {
    success: true,
    oldPath: commandPath,
    newPath,
    name,
    warnings,
    addedDisableModelInvocation,
  };
}
