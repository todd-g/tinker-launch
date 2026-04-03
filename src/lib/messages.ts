import { readFile, readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";
import { projects } from "@/lib/db";

const CLAUDE_PROJECTS = path.join(os.homedir(), ".claude", "projects");

// ── Types ──────────────────────────────────────────────────────────────

export interface SessionIndex {
  sessionId: string;
  fullPath: string;
  fileMtime: number;
  firstPrompt: string;
  summary: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch: string;
  projectPath: string;
  isSidechain: boolean;
}

export interface ConversationMessage {
  type: "user" | "assistant";
  text: string;
  timestamp: string;
  sessionId: string;
  isMeta?: boolean;
  toolUses?: { name: string; id: string }[];
  model?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
  };
}

export interface SessionSummary {
  sessionId: string;
  projectPath: string;
  projectName: string | null;
  tinkerProjectId: string | null;
  summary: string;
  firstPrompt: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch: string;
}

export interface PromptPattern {
  pattern: string;
  count: number;
  examples: string[];
  projects: string[];
  lastUsed: string;
}

export interface ProjectStats {
  projectPath: string;
  projectName: string | null;
  tinkerProjectId: string | null;
  sessionCount: number;
  totalMessages: number;
  firstSession: string;
  lastSession: string;
}

export interface ToolUsageStats {
  tool: string;
  count: number;
  sessions: number;
}

export interface AnalysisResult {
  totalProjects: number;
  totalSessions: number;
  totalUserMessages: number;
  totalAssistantMessages: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  projectStats: ProjectStats[];
  promptPatterns: PromptPattern[];
  toolUsage: ToolUsageStats[];
  recentSessions: SessionSummary[];
  slashCommandUsage: { command: string; count: number }[];
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Map a Claude projects directory name back to a Tinker project.
 */
function matchTinkerProject(projectPath: string): { id: string; projectName: string } | null {
  const allProjects = projects.list();
  return allProjects.find((p) => projectPath === p.localPath) || null;
}

/**
 * Decode a Claude projects directory name back to a project path.
 * e.g., "-Users-toddgalloway-Documents-GitHub-minimabridge" → "/Users/toddgalloway/Documents/GitHub/minimabridge"
 */
function decodeDirName(dirName: string): string {
  if (!dirName.startsWith("-")) return "";
  return "/" + dirName.slice(1).replace(/-/g, "/");
}

/**
 * Load all sessions across all Claude Code project directories.
 * Uses sessions-index.json where available, falls back to scanning JSONL files.
 */
export async function loadAllSessionIndices(): Promise<{
  sessions: SessionSummary[];
  byProject: Map<string, SessionSummary[]>;
  /** Map sessionId → JSONL file path for parsing */
  sessionFiles: Map<string, string>;
}> {
  if (!existsSync(CLAUDE_PROJECTS)) return { sessions: [], byProject: new Map(), sessionFiles: new Map() };

  const projectDirs = await readdir(CLAUDE_PROJECTS, { withFileTypes: true });
  const sessions: SessionSummary[] = [];
  const byProject = new Map<string, SessionSummary[]>();
  const sessionFiles = new Map<string, string>();
  const indexedSessionIds = new Set<string>();

  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue;

    const dirPath = path.join(CLAUDE_PROJECTS, dir.name);

    // Index all JSONL files in this directory
    try {
      const files = await readdir(dirPath);
      for (const file of files) {
        if (file.endsWith(".jsonl")) {
          const sessionId = file.replace(".jsonl", "");
          sessionFiles.set(sessionId, path.join(dirPath, file));
        }
      }
    } catch {
      continue;
    }

    // Try sessions-index.json first for rich metadata
    const indexPath = path.join(dirPath, "sessions-index.json");
    if (existsSync(indexPath)) {
      try {
        const raw = await readFile(indexPath, "utf-8");
        const data = JSON.parse(raw);
        const entries: SessionIndex[] = data.entries || [];
        const projectPath = data.originalPath || decodeDirName(dir.name);
        const tinkerProject = matchTinkerProject(projectPath);

        for (const entry of entries) {
          if (entry.isSidechain) continue;
          indexedSessionIds.add(entry.sessionId);
          const summary: SessionSummary = {
            sessionId: entry.sessionId,
            projectPath,
            projectName: tinkerProject?.projectName || path.basename(projectPath) || dir.name,
            tinkerProjectId: tinkerProject?.id || null,
            summary: entry.summary,
            firstPrompt: entry.firstPrompt,
            messageCount: entry.messageCount,
            created: entry.created,
            modified: entry.modified,
            gitBranch: entry.gitBranch,
          };
          sessions.push(summary);

          const projSessions = byProject.get(projectPath) || [];
          projSessions.push(summary);
          byProject.set(projectPath, projSessions);
        }
      } catch {
        // Skip broken index files
      }
    }

    // For dirs without an index, create basic sessions from JSONL files
    if (!existsSync(indexPath)) {
      const projectPath = decodeDirName(dir.name);
      const tinkerProject = matchTinkerProject(projectPath);

      try {
        const files = await readdir(dirPath);
        for (const file of files) {
          if (!file.endsWith(".jsonl")) continue;
          const sessionId = file.replace(".jsonl", "");
          if (indexedSessionIds.has(sessionId)) continue;
          // Check if it's a subagent file (in a subdirectory)
          const filePath = path.join(dirPath, file);
          const fileStat = await stat(filePath);

          const summary: SessionSummary = {
            sessionId,
            projectPath,
            projectName: tinkerProject?.projectName || path.basename(projectPath) || dir.name,
            tinkerProjectId: tinkerProject?.id || null,
            summary: "",
            firstPrompt: "",
            messageCount: 0,
            created: new Date(fileStat.birthtimeMs).toISOString(),
            modified: new Date(fileStat.mtimeMs).toISOString(),
            gitBranch: "",
          };
          sessions.push(summary);

          const projSessions = byProject.get(projectPath) || [];
          projSessions.push(summary);
          byProject.set(projectPath, projSessions);
        }
      } catch {
        // ignore
      }
    }
  }

  // Sort by modified desc
  sessions.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

  return { sessions, byProject, sessionFiles };
}

/**
 * Parse a single conversation JSONL file and extract user messages and tool usage.
 */
async function parseConversation(
  jsonlPath: string,
  sessionId: string
): Promise<ConversationMessage[]> {
  if (!existsSync(jsonlPath)) return [];

  try {
    const raw = await readFile(jsonlPath, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const messages: ConversationMessage[] = [];

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === "user" && !obj.isMeta) {
          const content = obj.message?.content;
          let text = "";
          if (typeof content === "string") {
            text = content;
          } else if (Array.isArray(content)) {
            text = content
              .filter((c: { type: string }) => c.type === "text")
              .map((c: { text: string }) => c.text)
              .join("\n");
          }
          if (text) {
            messages.push({
              type: "user",
              text,
              timestamp: obj.timestamp,
              sessionId,
            });
          }
        } else if (obj.type === "assistant") {
          const content = obj.message?.content;
          const toolUses: { name: string; id: string }[] = [];
          let text = "";

          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "text") {
                text += block.text;
              } else if (block.type === "tool_use") {
                toolUses.push({ name: block.name, id: block.id });
              }
            }
          }

          messages.push({
            type: "assistant",
            text,
            timestamp: obj.timestamp,
            sessionId,
            toolUses: toolUses.length > 0 ? toolUses : undefined,
            model: obj.message?.model,
            usage: obj.message?.usage,
          });
        }
      } catch {
        // Skip malformed lines
      }
    }

    return messages;
  } catch {
    return [];
  }
}

// ── Pattern Detection ──────────────────────────────────────────────────

/**
 * Normalize a user prompt for pattern matching.
 * Strips XML tags, code blocks, file paths, and collapses whitespace.
 */
function normalizePrompt(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ") // strip XML/HTML tags
    .replace(/```[\s\S]*?```/g, " ") // strip code blocks
    .replace(/\/[^\s]+\.[a-z]+/g, "[path]") // normalize file paths
    .replace(/https?:\/\/[^\s]+/g, "[url]") // normalize URLs
    .replace(/[0-9a-f]{8,}/gi, "[hash]") // normalize hashes/IDs
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 200); // cap length for comparison
}

/**
 * Extract the "intent" of a prompt — the first meaningful sentence or command.
 */
function extractIntent(text: string): string {
  // Check for slash commands
  const slashMatch = text.match(/^\s*\/?([a-z][\w-]*)/);
  if (slashMatch && text.trim().startsWith("/")) {
    return `/${slashMatch[1]}`;
  }

  // Strip system/command tags
  const cleaned = text
    .replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();

  // Take first sentence or first 100 chars
  const firstSentence = cleaned.split(/[.!?\n]/).filter(Boolean)[0] || cleaned;
  return firstSentence.trim().slice(0, 100);
}

/**
 * Detect slash command usage in prompts.
 */
function extractSlashCommands(messages: ConversationMessage[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const msg of messages) {
    if (msg.type !== "user") continue;
    // Check for slash command in command tags
    const cmdMatch = msg.text.match(/<command-name>\/([\w-:]+)<\/command-name>/);
    if (cmdMatch) {
      const cmd = `/${cmdMatch[1]}`;
      counts.set(cmd, (counts.get(cmd) || 0) + 1);
    }
    // Check for raw slash commands at start
    const rawMatch = msg.text.trim().match(/^\/([a-z][\w-:]*)/);
    if (rawMatch && !cmdMatch) {
      const cmd = `/${rawMatch[1]}`;
      counts.set(cmd, (counts.get(cmd) || 0) + 1);
    }
  }
  return counts;
}

/**
 * Group similar prompts into patterns using simple n-gram bucketing.
 */
function detectPatterns(
  messages: ConversationMessage[],
  projectPathMap: Map<string, string>
): PromptPattern[] {
  const buckets = new Map<string, {
    count: number;
    examples: string[];
    projects: Set<string>;
    lastUsed: string;
  }>();

  for (const msg of messages) {
    if (msg.type !== "user") continue;

    const intent = extractIntent(msg.text);
    if (!intent || intent.length < 5) continue;

    // Skip system/meta messages
    if (msg.text.includes("<system-reminder>") || msg.text.includes("<local-command")) continue;

    const normalized = normalizePrompt(intent);
    if (!normalized || normalized.length < 5) continue;

    const bucket = buckets.get(normalized);
    const projectName = projectPathMap.get(msg.sessionId) || "unknown";

    if (bucket) {
      bucket.count++;
      if (bucket.examples.length < 3) bucket.examples.push(intent);
      bucket.projects.add(projectName);
      if (msg.timestamp > bucket.lastUsed) bucket.lastUsed = msg.timestamp;
    } else {
      buckets.set(normalized, {
        count: 1,
        examples: [intent],
        projects: new Set([projectName]),
        lastUsed: msg.timestamp,
      });
    }
  }

  // Return patterns with count >= 2, sorted by count
  return Array.from(buckets.entries())
    .filter(([, v]) => v.count >= 2)
    .map(([pattern, v]) => ({
      pattern,
      count: v.count,
      examples: v.examples,
      projects: Array.from(v.projects),
      lastUsed: v.lastUsed,
    }))
    .sort((a, b) => b.count - a.count);
}

// ── Main Analysis ──────────────────────────────────────────────────────

/**
 * Run full analysis across all Claude Code conversations.
 * Parses up to `maxSessions` most recent sessions for performance.
 */
export async function analyzeMessages(maxSessions = 100): Promise<AnalysisResult> {
  const { sessions, byProject, sessionFiles } = await loadAllSessionIndices();

  // Build project stats
  const projectStats: ProjectStats[] = [];
  for (const [projectPath, projSessions] of byProject) {
    const tinkerProject = matchTinkerProject(projectPath);
    const sorted = projSessions.sort(
      (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()
    );
    projectStats.push({
      projectPath,
      projectName: tinkerProject?.projectName || path.basename(projectPath),
      tinkerProjectId: tinkerProject?.id || null,
      sessionCount: projSessions.length,
      totalMessages: projSessions.reduce((sum, s) => sum + s.messageCount, 0),
      firstSession: sorted[0]?.created || "",
      lastSession: sorted[sorted.length - 1]?.modified || "",
    });
  }
  projectStats.sort((a, b) => b.sessionCount - a.sessionCount);

  // Parse JSONL files directly (index session IDs don't match file names)
  // Sort files by mtime desc, take most recent maxSessions
  const fileEntries: { sessionId: string; path: string; mtime: number }[] = [];
  for (const [sessionId, filePath] of sessionFiles) {
    try {
      const s = await stat(filePath);
      fileEntries.push({ sessionId, path: filePath, mtime: s.mtimeMs });
    } catch {
      // skip
    }
  }
  fileEntries.sort((a, b) => b.mtime - a.mtime);

  const filesToParse = fileEntries.slice(0, maxSessions);
  const allMessages: ConversationMessage[] = [];
  const sessionProjectMap = new Map<string, string>();

  // Map dir names to project names
  const dirProjectMap = new Map<string, string>();
  for (const [projPath, projSessions] of byProject) {
    if (projSessions.length > 0) {
      dirProjectMap.set(projPath, projSessions[0].projectName || "unknown");
    }
  }

  for (const entry of filesToParse) {
    const msgs = await parseConversation(entry.path, entry.sessionId);
    allMessages.push(...msgs);

    // Derive project name from directory
    const dirName = path.basename(path.dirname(entry.path));
    const projectPath = decodeDirName(dirName);
    const tinkerProject = matchTinkerProject(projectPath);
    const projectName = tinkerProject?.projectName || path.basename(projectPath) || dirName;
    sessionProjectMap.set(entry.sessionId, projectName);
  }

  const userMessages = allMessages.filter((m) => m.type === "user");
  const assistantMessages = allMessages.filter((m) => m.type === "assistant");

  // Token usage
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const msg of assistantMessages) {
    if (msg.usage) {
      totalInputTokens += msg.usage.input_tokens || 0;
      totalOutputTokens += msg.usage.output_tokens || 0;
    }
  }

  // Tool usage
  const toolCounts = new Map<string, { count: number; sessions: Set<string> }>();
  for (const msg of assistantMessages) {
    if (msg.toolUses) {
      for (const tool of msg.toolUses) {
        const entry = toolCounts.get(tool.name) || { count: 0, sessions: new Set() };
        entry.count++;
        entry.sessions.add(msg.sessionId);
        toolCounts.set(tool.name, entry);
      }
    }
  }
  const toolUsage: ToolUsageStats[] = Array.from(toolCounts.entries())
    .map(([tool, v]) => ({ tool, count: v.count, sessions: v.sessions.size }))
    .sort((a, b) => b.count - a.count);

  // Prompt patterns
  const promptPatterns = detectPatterns(allMessages, sessionProjectMap);

  // Slash command usage
  const slashCounts = extractSlashCommands(allMessages);
  const slashCommandUsage = Array.from(slashCounts.entries())
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalProjects: byProject.size,
    totalSessions: sessions.length,
    totalUserMessages: userMessages.length,
    totalAssistantMessages: assistantMessages.length,
    totalInputTokens,
    totalOutputTokens,
    projectStats,
    promptPatterns,
    toolUsage,
    recentSessions: sessions.slice(0, 20),
    slashCommandUsage,
  };
}
