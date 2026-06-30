import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

interface ProjectInfo {
  _id: string;
  localPath: string;
  port: number;
  projectName: string;
  repoName: string;
  prodUrl: string;
  stagingUrl: string;
  aliases: string; // comma-separated
  linearSlug: string;
  webflowSlug: string;
  org: string;
}

export interface SlackTitleInfo {
  channel: string;
  channelType: "channel" | "dm" | "unknown";
  workspace: string;
  org: string | null;
}

export interface BrowserOrgInfo {
  org: string;
  chromeProfile: string;
  category: "email" | "docs" | "browsing";
}

interface MatchResult {
  projectId: string;
  projectName: string;
  activityType:
    | "coding"
    | "browser_local"
    | "browser_staging"
    | "browser_prod"
    | "browser_email"
    | "browser_docs"
    | "browser_figma"
    | "browser_linear"
    | "browser_webflow"
    | "browser_workflow"
    | "xcode"
    | "slack"
    | "meeting"
    | "other";
  slackInfo?: SlackTitleInfo;
  browserOrgInfo?: BrowserOrgInfo;
}

const TERMINAL_BUNDLE_IDS = new Set([
  "com.apple.Terminal",
  "com.googlecode.iterm2",
  "dev.warp.Warp-Stable",
  "com.mitchellh.ghostty",
  "net.kovidgoyal.kitty",
]);

const BROWSER_BUNDLE_IDS = new Set([
  "com.google.Chrome",
  "com.brave.Browser",
  "org.mozilla.firefox",
  "com.apple.Safari",
  "company.thebrowser.Browser",
]);

const SLACK_BUNDLE_IDS = new Set([
  "com.tinyspeck.slackmacgap",
]);

const MEETING_BUNDLE_IDS = new Set([
  "us.zoom.xos",
]);

// Window-tracker apps that are raw app-presence / idle, NOT real activity — flagged
// non-reportable like Terminal "coding" so they don't pile into the Unmatched row:
//   - Claude desktop ("Claude", no project signal): the real signal is the cc_turn
//     transcript data (bundle com.anthropic.claude-code, a different source — stays reportable).
//   - loginwindow: the screen is locked / logged out — pure idle.
const NON_REPORTABLE_BUNDLE_IDS = new Set([
  "com.anthropic.claudefordesktop",
  "com.apple.loginwindow",
]);

const SLACK_WORKSPACE_ORG_MAP: Record<string, string> = {
  "Minima": "minimagroup",
  "Super Green": "Super-Green",
};

const CHROME_PROFILE_ORG_MAP: Record<string, string> = {
  "Todd": "toddgalloway",
  "Todd (ToddMinima)": "minimagroup",
  "todd (super.green)": "Super-Green",
};

export function matchWindowToProject(
  app: string,
  windowTitle: string,
  bundleId: string,
  projects: ProjectInfo[],
  url?: string
): MatchResult | null {
  // Terminal apps: parse directory from window title
  if (TERMINAL_BUNDLE_IDS.has(bundleId)) {
    return matchTerminal(windowTitle, projects);
  }

  // VS Code: match folder name from window title
  if (bundleId.toLowerCase().includes("vscode")) {
    return matchEditor(windowTitle, projects);
  }

  // Xcode: parse project name from window title
  if (bundleId === "com.apple.dt.Xcode") {
    return matchXcode(windowTitle, projects);
  }

  // Browser: match on URL first, then fall back to title
  if (BROWSER_BUNDLE_IDS.has(bundleId)) {
    return matchBrowser(windowTitle, projects, url);
  }

  // Meeting apps (Zoom, etc.): tag as meeting, no org/project attribution
  if (MEETING_BUNDLE_IDS.has(bundleId)) {
    return { projectId: "", projectName: "", activityType: "meeting" };
  }

  // Slack: match project name in channel/conversation
  if (SLACK_BUNDLE_IDS.has(bundleId)) {
    return matchSlack(windowTitle, projects);
  }

  return null;
}

function matchTerminal(
  windowTitle: string,
  projects: ProjectInfo[]
): MatchResult | null {
  // Terminal titles often contain paths like:
  //   ~/Documents/GitHub/my-project
  //   user@host:~/Documents/GitHub/my-project
  //   /Users/someone/Documents/GitHub/my-project
  // Expand ~ to home directory for comparison
  const home = os.homedir();
  const titleNormalized = windowTitle.replace(/~/g, home);

  for (const project of projects) {
    // Normalize localPath for comparison
    const normalizedLocalPath = project.localPath.replace(/~/g, home);

    if (titleNormalized.includes(normalizedLocalPath)) {
      return {
        projectId: project._id,
        projectName: project.projectName,
        activityType: "coding",
      };
    }

    // Also try matching just the last directory segment
    const dirName = path.basename(normalizedLocalPath);
    // Check if the directory name appears as a path segment in the title
    const segmentPattern = new RegExp(`(?:^|[/:\\s])${escapeRegex(dirName)}(?:[/\\s]|$)`);
    if (segmentPattern.test(titleNormalized)) {
      return {
        projectId: project._id,
        projectName: project.projectName,
        activityType: "coding",
      };
    }
  }

  return null;
}

function matchEditor(
  windowTitle: string,
  projects: ProjectInfo[]
): MatchResult | null {
  // VS Code/Cursor titles are usually like: "filename — folderName" or "folderName"
  for (const project of projects) {
    const lastSegment = path.basename(project.localPath.replace(/~/g, ""));

    if (
      windowTitle.includes(project.repoName) ||
      windowTitle.includes(lastSegment)
    ) {
      return {
        projectId: project._id,
        projectName: project.projectName,
        activityType: "coding",
      };
    }
  }

  return null;
}

function matchBrowser(
  windowTitle: string,
  projects: ProjectInfo[],
  url?: string
): MatchResult | null {
  const urlLower = (url || "").toLowerCase();

  // Parse Chrome profile early — attach to every result for org-level rollup
  const browserOrgInfo = parseChromeProfileOrg(windowTitle, urlLower) ?? undefined;

  // ── URL-based matching (primary, most reliable) ──

  if (urlLower) {
    // localhost:PORT → local dev
    const localhostMatch = urlLower.match(/localhost:(\d+)/);
    if (localhostMatch) {
      const port = parseInt(localhostMatch[1], 10);
      for (const project of projects) {
        if (project.port === port) {
          return {
            projectId: project._id,
            projectName: project.projectName,
            activityType: "browser_local",
            browserOrgInfo,
          };
        }
      }
    }

    // Linear: match linear.app/{slug} to project with that linearSlug
    const linearMatch = urlLower.match(/linear\.app\/([^/]+)/);
    if (linearMatch) {
      const slug = linearMatch[1];
      for (const project of projects) {
        if (project.linearSlug && project.linearSlug.toLowerCase() === slug) {
          return {
            projectId: project._id,
            projectName: project.projectName,
            activityType: "browser_linear",
            browserOrgInfo,
          };
        }
      }
    }

    // Webflow: match {slug}.design.webflow.com, {slug}.webflow.io, or webflow.com/dashboard/sites/{slug}
    // Branch URLs look like {slug}-{hex}.design.webflow.com — extract the subdomain and match
    // against known project webflowSlugs using startsWith to handle branch hashes.
    const webflowDesignMatch = urlLower.match(/([a-z0-9][a-z0-9-]*)\.design\.webflow\.com/);
    const webflowIoMatch = urlLower.match(/([a-z0-9-]+)\.webflow\.io/);
    const webflowDashMatch = urlLower.match(/webflow\.com\/dashboard\/sites\/([a-z0-9-]+)/);
    const webflowSubdomain = webflowDesignMatch?.[1] || webflowIoMatch?.[1] || webflowDashMatch?.[1];
    if (webflowSubdomain) {
      for (const project of projects) {
        if (project.webflowSlug) {
          const slug = project.webflowSlug.toLowerCase();
          // Exact match or branch URL (subdomain starts with slug followed by a dash + hex hash)
          if (webflowSubdomain === slug || webflowSubdomain.startsWith(slug + "-")) {
            return {
              projectId: project._id,
              projectName: project.projectName,
              activityType: "browser_webflow",
              browserOrgInfo,
            };
          }
        }
      }
    }

    // Workflow.design: match workflow.design or app.workflow.design to project with "workflow" alias
    if (urlLower.includes("workflow.design")) {
      for (const project of projects) {
        const aliasTokens = (project.aliases || "").toLowerCase().split(",").map((a) => a.trim()).filter(Boolean);
        if (aliasTokens.includes("workflow") || aliasTokens.includes("workflow.design")) {
          return {
            projectId: project._id,
            projectName: project.projectName,
            activityType: "browser_workflow",
            browserOrgInfo,
          };
        }
      }
    }

    for (const project of projects) {
      // Check production URL domain in actual URL
      if (project.prodUrl) {
        const domain = project.prodUrl.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
        if (urlLower.includes(domain)) {
          return {
            projectId: project._id,
            projectName: project.projectName,
            activityType: "browser_prod",
            browserOrgInfo,
          };
        }
      }

      // Check staging URL domain in actual URL
      if (project.stagingUrl) {
        const domain = project.stagingUrl.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
        if (urlLower.includes(domain)) {
          return {
            projectId: project._id,
            projectName: project.projectName,
            activityType: "browser_staging",
            browserOrgInfo,
          };
        }
      }
    }
  }

  // Figma: extract file name from title and match against project names/aliases
  // Titles: "Daymark Health Web – Figma - Google Chrome - profile"
  //         "Daymark Health Web – Figma - High memory usage - 1.3 GB - Google Chrome - profile"
  //         "Daymark Health Web - ↳ Design - Google Chrome - profile" (prototype)
  const figmaNameMatch = windowTitle.match(/^(.+?)\s*[\u2013–-]\s*(?:Figma|↳)/);
  if (figmaNameMatch) {
    const figmaFileName = figmaNameMatch[1].trim().toLowerCase();
    // Tokenize the Figma file name into significant words (4+ chars, skip generic words)
    const FIGMA_STOPWORDS = new Set(["web", "app", "site", "page", "design", "draft", "copy", "test", "demo", "new", "old", "the"]);
    const figmaWords = figmaFileName.split(/[\s-]+/).filter((w) => w.length >= 4 && !FIGMA_STOPWORDS.has(w));

    for (const project of projects) {
      const nameWords = project.projectName.toLowerCase().split(/[\s-]+/).filter((w) => w.length >= 4 && !FIGMA_STOPWORDS.has(w));
      const aliasTokens = (project.aliases || "").toLowerCase().split(",").map((a) => a.trim()).filter(Boolean);

      // Match if any significant word from the Figma file name appears in the project name
      const wordMatch = figmaWords.some((fw) => nameWords.some((nw) => nw.includes(fw) || fw.includes(nw)));
      // Or if any alias matches
      const aliasMatch = aliasTokens.some((alias) => figmaFileName.includes(alias) || alias.includes(figmaFileName));

      if (wordMatch || aliasMatch) {
        return {
          projectId: project._id,
          projectName: project.projectName,
          activityType: "browser_figma",
          browserOrgInfo,
        };
      }
    }
  }

  // No project match — classify known tools (email, docs, figma) before falling back to "other"
  const toolType = classifyBrowserTool(urlLower) || classifyBrowserToolFromTitle(windowTitle);
  if (toolType) {
    return {
      projectId: "",
      projectName: "",
      activityType: toolType,
      browserOrgInfo,
    };
  }

  // No project match — still attribute to org via Chrome profile
  if (browserOrgInfo) {
    return {
      projectId: "",
      projectName: "",
      activityType: "other",
      browserOrgInfo,
    };
  }

  return null;
}

export function parseChromeProfileOrg(windowTitle: string, url: string): BrowserOrgInfo | null {
  // Chrome titles end with " - Google Chrome - ProfileName"
  const chromeMatch = windowTitle.match(/ - Google Chrome - (.+)$/);
  if (!chromeMatch) return null;

  const profile = chromeMatch[1].trim();
  const org = CHROME_PROFILE_ORG_MAP[profile];
  if (!org) return null;

  return {
    org,
    chromeProfile: profile,
    category: classifyBrowserCategory(url),
  };
}

function classifyBrowserCategory(url: string): "email" | "docs" | "browsing" {
  if (url.includes("mail.google.com")) return "email";
  if (url.includes("docs.google.com") || url.includes("drive.google.com") ||
      url.includes("sheets.google.com") || url.includes("slides.google.com")) return "docs";
  return "browsing";
}

/** Classify a browser URL as a known tool activity type, or null for generic browsing */
type BrowserToolType = "browser_email" | "browser_docs" | "browser_figma" | "browser_linear" | "browser_webflow";

/** Classify a browser URL as a known tool activity type, or null for generic browsing */
function classifyBrowserTool(url: string): BrowserToolType | null {
  if (!url) return null;
  if (url.includes("mail.google.com")) return "browser_email";
  if (url.includes("docs.google.com") || url.includes("sheets.google.com") ||
      url.includes("slides.google.com") || url.includes("drive.google.com")) return "browser_docs";
  if (url.includes("figma.com")) return "browser_figma";
  if (url.includes("linear.app")) return "browser_linear";
  if (url.includes("webflow.com") || url.includes("webflow.io")) return "browser_webflow";
  return null;
}

/** Fallback: classify from window title when URL is unavailable */
function classifyBrowserToolFromTitle(title: string): BrowserToolType | null {
  if (!title) return null;
  if (title.includes("Gmail")) return "browser_email";
  if (title.includes("Google Docs") || title.includes("Google Sheets") ||
      title.includes("Google Slides") || title.includes("Google Drive")) return "browser_docs";
  if (title.includes("Figma")) return "browser_figma";
  if (title.includes("Linear")) return "browser_linear";
  if (title.includes("Webflow")) return "browser_webflow";
  return null;
}

function matchXcode(
  windowTitle: string,
  projects: ProjectInfo[]
): MatchResult | null {
  // Xcode titles are usually "ProjectName — TargetName" or "ProjectName"
  // Extract the project name portion (before the em dash if present)
  const xcodeName = windowTitle.split(/\s*[—–-]\s*/)[0].trim();

  for (const project of projects) {
    if (
      xcodeName.toLowerCase() === project.projectName.toLowerCase() ||
      xcodeName.toLowerCase() === project.repoName.toLowerCase() ||
      windowTitle.includes(project.repoName)
    ) {
      return {
        projectId: project._id,
        projectName: project.projectName,
        activityType: "xcode",
      };
    }
  }

  return null;
}

export function parseSlackTitle(windowTitle: string): SlackTitleInfo | null {
  // Slack titles use either hyphens or em dashes as separators:
  //   "channel-name (Channel) - Workspace - Slack"
  //   "Threads — Super Green — Slack 🐙"
  // Normalize em dashes (—) and en dashes (–) to " - " before splitting
  const normalized = windowTitle.replace(/\s*[—–]\s*/g, " - ");
  const parts = normalized.split(" - ");
  // The last part may have trailing emoji/whitespace (e.g. "Slack 🐙")
  if (parts.length < 3 || !parts[parts.length - 1].trim().startsWith("Slack")) return null;

  const workspace = parts[parts.length - 2].trim();
  const channelPart = parts.slice(0, parts.length - 2).join(" - ").trim();

  let channel = channelPart;
  let channelType: "channel" | "dm" | "unknown" = "unknown";

  const typeMatch = channelPart.match(/^(.+?)\s*\((Channel|DM)\)\s*$/);
  if (typeMatch) {
    channel = typeMatch[1].trim();
    channelType = typeMatch[2].toLowerCase() as "channel" | "dm";
  }

  return {
    channel,
    channelType,
    workspace,
    org: SLACK_WORKSPACE_ORG_MAP[workspace] ?? null,
  };
}

function matchSlack(
  windowTitle: string,
  projects: ProjectInfo[]
): MatchResult | null {
  const slackInfo = parseSlackTitle(windowTitle);
  if (!slackInfo) return null;

  const titleLower = windowTitle.toLowerCase();

  // Try to match channel to a specific project
  for (const project of projects) {
    if (titleLower.includes(project.repoName.toLowerCase())) {
      return {
        projectId: project._id,
        projectName: project.projectName,
        activityType: "slack",
        slackInfo,
      };
    }

    if (project.projectName.length >= 3 && titleLower.includes(project.projectName.toLowerCase())) {
      return {
        projectId: project._id,
        projectName: project.projectName,
        activityType: "slack",
        slackInfo,
      };
    }

    if (project.aliases) {
      const aliasList = project.aliases.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
      for (const alias of aliasList) {
        if (alias.length >= 3 && titleLower.includes(alias)) {
          return {
            projectId: project._id,
            projectName: project.projectName,
            activityType: "slack",
            slackInfo,
          };
        }
      }
    }
  }

  // No project match — return with empty projectId so ingestion can route to org
  if (slackInfo.org) {
    return {
      projectId: "",
      projectName: "",
      activityType: "slack",
      slackInfo,
    };
  }

  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Format a Date or timestamp as YYYY-MM-DD in the local timezone */
function toLocalDateString(d: Date | number): string {
  const date = typeof d === "number" ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Activity data directory
// ---------------------------------------------------------------------------

export async function getActivityDataDir(): Promise<string> {
  const dir = path.join(os.homedir(), ".tinker-launch", "activity");
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Claude Code session file parser
// ---------------------------------------------------------------------------

export interface CCTurn {
  timestamp: number;       // start of turn (user message time)
  durationSeconds: number; // bounded per-turn estimate: 10s base + typing (~2 chars/sec, capped 5min)
  userChars: number;       // characters the user typed
}

export interface CCSessionStats {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  humanMessageCount: number;   // real human messages only (excludes tool results & injections)
  assistantMessageCount: number;
  claudeMinutes: number;
  turns: CCTurn[];
  isAutomated: boolean;        // true if session contains scheduled_task_fire (e.g. /loop)
}

// ---------------------------------------------------------------------------
// Window focus ingestion — reads JSONL, matches to projects, writes to SQLite
// ---------------------------------------------------------------------------

export async function runWindowIngest(): Promise<{ ingested: number; rematched: number }> {
  // Lazy-import db to avoid circular issues at module level
  const { projects: projectsDb, activitySnapshots: snapshotsDb, activityDaily: activityDailyDb, orgSlackDaily: orgSlackDailyDb, orgBrowserDaily: orgBrowserDailyDb } = await import("@/lib/db");

  const DATA_DIR = path.join(os.homedir(), ".tinker-launch/activity");
  const JSONL_FILE = path.join(DATA_DIR, "window-focus.jsonl");
  const STATE_FILE = path.join(DATA_DIR, "last-ingest.json");
  const SNAPSHOT_INTERVAL_SEC = 10;
  const MINUTES_PER_SNAPSHOT = SNAPSHOT_INTERVAL_SEC / 60;

  if (!fs.existsSync(JSONL_FILE)) {
    // Still try to rematch previously unmatched snapshots
    const rematched = await rematchUnmatched(projectsDb, snapshotsDb, activityDailyDb, orgSlackDailyDb, orgBrowserDailyDb);
    return { ingested: 0, rematched };
  }

  const content = fs.readFileSync(JSONL_FILE, "utf-8").trimEnd();
  if (!content) return { ingested: 0, rematched: 0 };

  // Read state
  let lastTimestamp = 0;
  try {
    if (fs.existsSync(STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      lastTimestamp = state.lastTimestamp || 0;
    }
  } catch { /* ignore */ }

  const lines = content.split("\n");
  const entries: { timestamp: number; app: string; windowTitle: string; bundleId: string; url?: string }[] = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.timestamp > lastTimestamp) entries.push(entry);
    } catch { /* skip */ }
  }

  if (entries.length === 0) return { ingested: 0, rematched: 0 };

  const projectsList = projectsDb.list();
  const projectInfos = projectsList.map((p) => ({
    _id: p.id, localPath: p.localPath, port: p.port,
    projectName: p.projectName, repoName: p.repoName,
    prodUrl: p.prodUrl || "", stagingUrl: p.stagingUrl || "", aliases: p.aliases || "",
    linearSlug: p.linearSlug || "", webflowSlug: p.webflowSlug || "", org: p.org,
  }));

  // Build projectId → org lookup
  const projectOrgMap: Record<string, string> = {};
  for (const p of projectInfos) { projectOrgMap[p._id] = p.org; }

  const dailyAgg: Record<string, {
    projectId: string; date: string;
    codingMinutes: number; browserLocalMinutes: number;
    browserStagingMinutes: number; browserProdMinutes: number;
    browserWebflowMinutes: number; xcodeMinutes: number;
    slackMinutes: number; totalMinutes: number;
  }> = {};

  const orgSlackAgg: Record<string, {
    date: string; org: string; workspace: string;
    channel: string; channelType: string; minutes: number;
  }> = {};

  const orgBrowserAgg: Record<string, {
    date: string; org: string; chromeProfile: string;
    category: string; minutes: number;
  }> = {};

  const snapshots: import("@/lib/db").DbSnapshot[] = [];

  for (const entry of entries) {
    const match = matchWindowToProject(entry.app, entry.windowTitle, entry.bundleId, projectInfos, entry.url);

    // Determine org: project org > slack workspace org > chrome profile org
    const org = (match?.projectId ? projectOrgMap[match.projectId] : null)
      || match?.slackInfo?.org || match?.browserOrgInfo?.org || "";

    const activityType = match?.activityType || "other";
    // Window tracker "coding" just means Terminal/editor was focused — not a real coding signal.
    // Same for raw app-presence / idle apps (Claude desktop, loginwindow). All non-reportable;
    // the real Claude signal is the cc_transcript turns.
    const reportable = (activityType === "coding" || NON_REPORTABLE_BUNDLE_IDS.has(entry.bundleId)) ? 0 : 1;

    snapshots.push({
      ...entry,
      projectId: match?.projectId || undefined,
      projectName: match?.projectName || undefined,
      activityType,
      source: "window_tracker",
      durationSeconds: SNAPSHOT_INTERVAL_SEC,
      org,
      chromeProfile: match?.browserOrgInfo?.chromeProfile || "",
      browserCategory: match?.browserOrgInfo?.category || "",
      slackWorkspace: match?.slackInfo?.workspace || "",
      slackChannel: match?.slackInfo?.channel || "",
      slackChannelType: match?.slackInfo?.channelType || "",
      reportable,
    });

    if (match) {
      const date = toLocalDateString(entry.timestamp);

      // Always record org-level Slack time when we have slackInfo
      if (match.slackInfo?.org) {
        const slackKey = `${date}:${match.slackInfo.org}:${match.slackInfo.workspace}:${match.slackInfo.channel}`;
        if (!orgSlackAgg[slackKey]) {
          orgSlackAgg[slackKey] = {
            date, org: match.slackInfo.org, workspace: match.slackInfo.workspace,
            channel: match.slackInfo.channel, channelType: match.slackInfo.channelType,
            minutes: 0,
          };
        }
        orgSlackAgg[slackKey].minutes += MINUTES_PER_SNAPSHOT;
      }

      // Record org-level browser time (email/docs/browsing) when we have browserOrgInfo
      if (match.browserOrgInfo) {
        const browserKey = `${date}:${match.browserOrgInfo.org}:${match.browserOrgInfo.category}`;
        if (!orgBrowserAgg[browserKey]) {
          orgBrowserAgg[browserKey] = {
            date, org: match.browserOrgInfo.org,
            chromeProfile: match.browserOrgInfo.chromeProfile,
            category: match.browserOrgInfo.category,
            minutes: 0,
          };
        }
        orgBrowserAgg[browserKey].minutes += MINUTES_PER_SNAPSHOT;
      }

      // Project-level aggregation (skip if no real projectId)
      if (match.projectId) {
        const key = `${match.projectId}:${date}`;
        if (!dailyAgg[key]) {
          dailyAgg[key] = {
            projectId: match.projectId, date,
            codingMinutes: 0, browserLocalMinutes: 0,
            browserStagingMinutes: 0, browserProdMinutes: 0,
            browserWebflowMinutes: 0, xcodeMinutes: 0,
            slackMinutes: 0, totalMinutes: 0,
          };
        }
        const agg = dailyAgg[key];
        agg.totalMinutes += MINUTES_PER_SNAPSHOT;
        switch (match.activityType) {
          case "coding": agg.codingMinutes += MINUTES_PER_SNAPSHOT; break;
          case "browser_local": agg.browserLocalMinutes += MINUTES_PER_SNAPSHOT; break;
          case "browser_staging": agg.browserStagingMinutes += MINUTES_PER_SNAPSHOT; break;
          case "browser_prod": agg.browserProdMinutes += MINUTES_PER_SNAPSHOT; break;
          case "browser_webflow": agg.browserWebflowMinutes += MINUTES_PER_SNAPSHOT; break;
          case "xcode": agg.xcodeMinutes += MINUTES_PER_SNAPSHOT; break;
          case "slack": agg.slackMinutes += MINUTES_PER_SNAPSHOT; break;
        }
      }
    }
  }

  snapshotsDb.insertBatch(snapshots);
  for (const agg of Object.values(dailyAgg)) activityDailyDb.upsert(agg);
  for (const agg of Object.values(orgSlackAgg)) orgSlackDailyDb.upsert(agg);
  for (const agg of Object.values(orgBrowserAgg)) orgBrowserDailyDb.upsert(agg);

  const maxTimestamp = Math.max(...entries.map((e) => e.timestamp));
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ lastTimestamp: maxTimestamp, lastIngestAt: new Date().toISOString() }, null, 2));

  // Truncate processed entries
  const remaining = lines.filter((line) => {
    try { return JSON.parse(line).timestamp > maxTimestamp; } catch { return false; }
  });
  fs.writeFileSync(JSONL_FILE, remaining.length > 0 ? remaining.join("\n") + "\n" : "");

  // Re-match previously unmatched snapshots with current project list
  const rematched = await rematchUnmatched(projectsDb, snapshotsDb, activityDailyDb, orgSlackDailyDb, orgBrowserDailyDb);

  return { ingested: entries.length, rematched };
}

// ---------------------------------------------------------------------------
// Re-match unmatched snapshots against current project list
// ---------------------------------------------------------------------------

async function rematchUnmatched(
  projectsDb: { list: () => Array<{ id: string; localPath: string; port: number; projectName: string; repoName: string; prodUrl?: string; stagingUrl?: string; aliases?: string; linearSlug?: string; webflowSlug?: string; org: string }> },
  snapshotsDb: { listUnmatched: () => Array<{ id?: number; app: string; windowTitle: string; bundleId: string; timestamp: number; url?: string }>; updateMatch: (id: number, projectId: string, projectName: string, activityType: string) => void; updateMatchFull: (id: number, data: { activityType: string; org: string; slackWorkspace: string; slackChannel: string; slackChannelType: string }) => void },
  activityDailyDb: { upsert: (data: { projectId: string; date: string; codingMinutes: number; browserLocalMinutes: number; browserStagingMinutes: number; browserProdMinutes: number; browserWebflowMinutes: number; xcodeMinutes: number; slackMinutes: number; totalMinutes: number }) => void },
  orgSlackDailyDb: { upsert: (data: { date: string; org: string; workspace: string; channel: string; channelType: string; minutes: number }) => void },
  orgBrowserDailyDb: { upsert: (data: { date: string; org: string; chromeProfile: string; category: string; minutes: number }) => void },
): Promise<number> {
  const unmatched = snapshotsDb.listUnmatched();
  if (unmatched.length === 0) return 0;

  const projectsList = projectsDb.list();
  const projectInfos = projectsList.map((p) => ({
    _id: p.id, localPath: p.localPath, port: p.port,
    projectName: p.projectName, repoName: p.repoName,
    prodUrl: p.prodUrl || "", stagingUrl: p.stagingUrl || "", aliases: p.aliases || "",
    linearSlug: p.linearSlug || "", webflowSlug: p.webflowSlug || "", org: p.org,
  }));
  const projectOrgMap: Record<string, string> = {};
  for (const p of projectInfos) { projectOrgMap[p._id] = p.org; }

  let matched = 0;
  const MINUTES_PER_SNAPSHOT = 10 / 60;
  const dailyAgg: Record<string, {
    projectId: string; date: string;
    codingMinutes: number; browserLocalMinutes: number;
    browserStagingMinutes: number; browserProdMinutes: number;
    browserWebflowMinutes: number; xcodeMinutes: number;
    slackMinutes: number; totalMinutes: number;
  }> = {};
  const orgSlackAgg: Record<string, {
    date: string; org: string; workspace: string;
    channel: string; channelType: string; minutes: number;
  }> = {};
  const orgBrowserAgg: Record<string, {
    date: string; org: string; chromeProfile: string;
    category: string; minutes: number;
  }> = {};

  for (const snap of unmatched) {
    const match = matchWindowToProject(snap.app, snap.windowTitle, snap.bundleId, projectInfos, snap.url);
    if (match && snap.id) {
      if (match.projectId) {
        snapshotsDb.updateMatch(snap.id, match.projectId, match.projectName, match.activityType);
      } else if (match.slackInfo?.org || match.browserOrgInfo?.org) {
        snapshotsDb.updateMatchFull(snap.id, {
          activityType: match.activityType,
          org: match.slackInfo?.org || match.browserOrgInfo?.org || "",
          slackWorkspace: match.slackInfo?.workspace || "",
          slackChannel: match.slackInfo?.channel || "",
          slackChannelType: match.slackInfo?.channelType || "",
        });
      }
      matched++;

      const d = new Date(snap.timestamp);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      if (match.slackInfo?.org) {
        const slackKey = `${date}:${match.slackInfo.org}:${match.slackInfo.workspace}:${match.slackInfo.channel}`;
        if (!orgSlackAgg[slackKey]) {
          orgSlackAgg[slackKey] = {
            date, org: match.slackInfo.org, workspace: match.slackInfo.workspace,
            channel: match.slackInfo.channel, channelType: match.slackInfo.channelType,
            minutes: 0,
          };
        }
        orgSlackAgg[slackKey].minutes += MINUTES_PER_SNAPSHOT;
      }

      if (match.browserOrgInfo) {
        const browserKey = `${date}:${match.browserOrgInfo.org}:${match.browserOrgInfo.category}`;
        if (!orgBrowserAgg[browserKey]) {
          orgBrowserAgg[browserKey] = {
            date, org: match.browserOrgInfo.org,
            chromeProfile: match.browserOrgInfo.chromeProfile,
            category: match.browserOrgInfo.category,
            minutes: 0,
          };
        }
        orgBrowserAgg[browserKey].minutes += MINUTES_PER_SNAPSHOT;
      }

      if (match.projectId) {
        const key = `${match.projectId}:${date}`;
        if (!dailyAgg[key]) {
          dailyAgg[key] = {
            projectId: match.projectId, date,
            codingMinutes: 0, browserLocalMinutes: 0,
            browserStagingMinutes: 0, browserProdMinutes: 0,
            browserWebflowMinutes: 0, xcodeMinutes: 0,
            slackMinutes: 0, totalMinutes: 0,
          };
        }
        const agg = dailyAgg[key];
        agg.totalMinutes += MINUTES_PER_SNAPSHOT;
        switch (match.activityType) {
          case "coding": agg.codingMinutes += MINUTES_PER_SNAPSHOT; break;
          case "browser_local": agg.browserLocalMinutes += MINUTES_PER_SNAPSHOT; break;
          case "browser_staging": agg.browserStagingMinutes += MINUTES_PER_SNAPSHOT; break;
          case "browser_prod": agg.browserProdMinutes += MINUTES_PER_SNAPSHOT; break;
          case "browser_webflow": agg.browserWebflowMinutes += MINUTES_PER_SNAPSHOT; break;
          case "xcode": agg.xcodeMinutes += MINUTES_PER_SNAPSHOT; break;
          case "slack": agg.slackMinutes += MINUTES_PER_SNAPSHOT; break;
        }
      }
    }
  }

  for (const agg of Object.values(dailyAgg)) activityDailyDb.upsert(agg);
  for (const agg of Object.values(orgSlackAgg)) orgSlackDailyDb.upsert(agg);
  for (const agg of Object.values(orgBrowserAgg)) orgBrowserDailyDb.upsert(agg);

  return matched;
}

// ---------------------------------------------------------------------------
// CC transcript parsing — reads session files, writes token usage to SQLite
// ---------------------------------------------------------------------------

export async function runCCParse(opts?: { force?: boolean }): Promise<{ parsed: number; skipped: number }> {
  const { projects: projectsDb, ccUsageDaily: ccUsageDailyDb, ccSessionStats: ccSessionStatsDb, activitySnapshots: snapshotsDb } = await import("@/lib/db");

  const CLAUDE_DIR = path.join(os.homedir(), ".claude/projects");
  const STATE_DIR = path.join(os.homedir(), ".tinker-launch/activity");
  const STATE_FILE = path.join(STATE_DIR, "cc-parse-state.json");

  if (!fs.existsSync(CLAUDE_DIR)) return { parsed: 0, skipped: 0 };

  // Force re-parse: clear state and DB data
  if (opts?.force) {
    try { fs.unlinkSync(STATE_FILE); } catch { /* ok */ }
    ccUsageDailyDb.clear();
    ccSessionStatsDb.clear();
    // Also clear CC turns from the unified activity log
    const db = (await import("@/lib/db")).getDb();
    db.prepare("DELETE FROM activitySnapshots WHERE source = 'cc_transcript'").run();
  }

  // Read parse state
  let parsedSessions: Record<string, { size: number; lastParsed: string }> = {};
  try {
    if (fs.existsSync(STATE_FILE)) {
      parsedSessions = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")).parsedSessions || {};
    }
  } catch { /* ignore */ }

  const projectsList = projectsDb.list();

  // Build lookup: Claude dir name -> project info
  // Claude encodes /Users/foo/bar as -Users-foo-bar
  const projectByDirName: Record<string, { id: string; projectName: string; org: string }> = {};
  for (const p of projectsList) {
    const encodedPath = p.localPath.replace(/\//g, "-");
    projectByDirName[encodedPath] = { id: p.id, projectName: p.projectName, org: p.org };
  }

  let totalParsed = 0;
  let totalSkipped = 0;

  // Track which (projectId, date) pairs we touched so we can rebuild daily totals at the end
  const affectedKeys: Array<{ projectId: string; date: string }> = [];

  const projectDirs = fs.readdirSync(CLAUDE_DIR, { withFileTypes: true });

  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue;

    // Match this Claude project dir to a registered project
    const matchedProject = projectByDirName[dir.name] || null;
    if (!matchedProject) continue;

    const projectDir = path.join(CLAUDE_DIR, dir.name);

    // Scan for .jsonl files directly on disk (don't rely on sessions-index)
    const dirEntries = fs.readdirSync(projectDir, { withFileTypes: true });

    for (const entry of dirEntries) {
      if (!entry.name.endsWith(".jsonl")) continue;
      if (!entry.isFile()) continue;

      const sessionFile = path.join(projectDir, entry.name);
      const stat = fs.statSync(sessionFile);

      // Skip tiny files (< 100 bytes are likely empty/corrupt)
      if (stat.size < 100) continue;

      // Skip if already parsed and unchanged
      if (parsedSessions[sessionFile] && parsedSessions[sessionFile].size === stat.size) {
        totalSkipped++;
        continue;
      }

      try {
        const stats = await parseCCSessionFile(sessionFile);
        const sessionId = entry.name.replace(/\.jsonl$/, "");
        const sessionDate = toLocalDateString(stat.mtimeMs);

        // Store per-session stats — INSERT OR REPLACE so re-parsing is always idempotent
        ccSessionStatsDb.upsert({
          sessionId,
          projectId: matchedProject.id,
          date: sessionDate,
          inputTokens: stats.inputTokens,
          outputTokens: stats.outputTokens,
          cacheCreationTokens: stats.cacheCreationTokens,
          cacheReadTokens: stats.cacheReadTokens,
          humanMessageCount: stats.humanMessageCount,
          assistantMessageCount: stats.assistantMessageCount,
          claudeMinutes: stats.claudeMinutes,
          isAutomated: stats.isAutomated,
        });

        affectedKeys.push({ projectId: matchedProject.id, date: sessionDate });

        // Insert individual CC turns into unified activity log
        // Automated sessions (e.g. /loop) are logged but marked non-reportable
        // so they don't inflate human work hours
        if (stats.turns.length > 0) {
          const turnSnapshots = stats.turns.map((turn) => ({
            timestamp: turn.timestamp,
            app: "Claude Code",
            windowTitle: `CC session ${sessionId}`,
            bundleId: "com.anthropic.claude-code",
            projectId: matchedProject.id,
            projectName: matchedProject.projectName,
            activityType: "cc_turn" as const,
            source: "cc_transcript",
            durationSeconds: turn.durationSeconds,
            org: matchedProject.org,
            ccSessionId: sessionId,
            ccUserChars: turn.userChars,
            reportable: stats.isAutomated ? 0 : 1,
          }));
          snapshotsDb.insertBatch(turnSnapshots);
        }

        parsedSessions[sessionFile] = { size: stat.size, lastParsed: new Date().toISOString() };
        totalParsed++;
      } catch { /* skip */ }
    }
  }

  // Rebuild daily totals from per-session data for any (projectId, date) we touched
  if (affectedKeys.length > 0) ccUsageDailyDb.rebuildFromSessions(affectedKeys);

  // Save state
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ parsedSessions }, null, 2));

  return { parsed: totalParsed, skipped: totalSkipped };
}

// ---------------------------------------------------------------------------
// Daemon auto-install — ensures the window tracker LaunchAgent is loaded
// ---------------------------------------------------------------------------

function installLaunchAgent(agentName: string, scriptFile: string): void {
  const PLIST_PATH = path.join(os.homedir(), "Library/LaunchAgents", `${agentName}.plist`);
  if (fs.existsSync(PLIST_PATH)) return; // already installed

  const LOG_DIR = path.join(os.homedir(), ".tinker-launch/activity");
  const INSTALL_DIR = path.join(os.homedir(), ".tinker-launch/bin");
  const sourceScript = path.resolve(process.cwd(), `scripts/${scriptFile}`);
  const templatePath = path.resolve(process.cwd(), `scripts/${agentName}.plist`);

  if (!fs.existsSync(templatePath) || !fs.existsSync(sourceScript)) return;

  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(PLIST_PATH), { recursive: true });

  // Copy script to ~/.tinker-launch/bin/ so launchd can access it
  // (~/Documents is protected by macOS App Management)
  const installedScript = path.join(INSTALL_DIR, scriptFile);
  fs.copyFileSync(sourceScript, installedScript);
  fs.chmodSync(installedScript, "755");

  let plistContent = fs.readFileSync(templatePath, "utf-8");
  plistContent = plistContent.replace(/__SCRIPT_PATH__/g, installedScript);
  plistContent = plistContent.replace(/__LOG_DIR__/g, LOG_DIR);
  fs.writeFileSync(PLIST_PATH, plistContent);

  try { execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null`); } catch { /* ignore */ }
  execSync(`launchctl load "${PLIST_PATH}"`);
}

export function ensureDaemonInstalled(): void {
  installLaunchAgent("com.tinker-launch.window-tracker", "window-tracker.sh");
  installLaunchAgent("com.tinker-launch.ingest-daemon", "ingest-daemon.sh");
}

// ---------------------------------------------------------------------------
// Claude Code session file parser
// ---------------------------------------------------------------------------

export async function parseCCSessionFile(
  filePath: string
): Promise<CCSessionStats> {
  const stats: CCSessionStats = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    humanMessageCount: 0,
    assistantMessageCount: 0,
    claudeMinutes: 0,
    turns: [],
    isAutomated: false,
  };

  // For claude working time: track (type, timestamp, isRealHuman, userChars) per message
  const msgTimeline: { type: string; ts: number; isRealHuman: boolean; userChars: number }[] = [];

  const content = await fs.promises.readFile(filePath, "utf-8");
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      // Skip malformed lines
      continue;
    }

    const timestamp =
      (obj.timestamp as string | undefined) || (obj.ts as string | undefined);
    const type = obj.type as string | undefined;
    let ts: number | null = null;

    if (timestamp) {
      ts = new Date(timestamp).getTime();
      if (isNaN(ts)) ts = null;
    }

    // Detect automated sessions (e.g. /loop) by the presence of scheduled_task_fire
    if (type === "system" && (obj.subtype as string) === "scheduled_task_fire") {
      stats.isAutomated = true;
    }

    if (type === "human" || type === "user") {
      // Automatic tool results have sourceToolAssistantUUID; context continuation
      // injections are flagged with isCompactSummary or isVisibleInTranscriptOnly.
      const isRealHuman = !obj.sourceToolAssistantUUID
        && !obj.isCompactSummary
        && !obj.isVisibleInTranscriptOnly;
      if (isRealHuman) stats.humanMessageCount++;
      const msg = obj.message as Record<string, unknown> | undefined;
      const msgContent = msg?.content;
      let userChars = 0;
      if (typeof msgContent === "string") {
        userChars = msgContent.length;
      } else if (Array.isArray(msgContent)) {
        for (const block of msgContent) {
          if ((block as Record<string, unknown>).type === "text") {
            userChars += String((block as Record<string, unknown>).text || "").length;
          }
        }
      }
      if (ts) msgTimeline.push({ type: "user", ts, isRealHuman, userChars });
    } else if (type === "assistant") {
      stats.assistantMessageCount++;
      if (ts) msgTimeline.push({ type: "assistant", ts, isRealHuman: false, userChars: 0 });

      // Usage is nested under message.usage in Claude Code session files
      const message = obj.message as Record<string, unknown> | undefined;
      const usage = (message?.usage || obj.usage) as
        | Record<string, number>
        | undefined;
      if (usage) {
        stats.inputTokens += usage.input_tokens || 0;
        stats.outputTokens += usage.output_tokens || 0;
        stats.cacheCreationTokens += usage.cache_creation_input_tokens || 0;
        stats.cacheReadTokens += usage.cache_read_input_tokens || 0;
      }
    }
  }

  // Estimate Claude time per turn from the user's prompt size, bounded — the SAME basis
  // the Day Timeline uses to size each cc_turn block. Per real human message that got an
  // assistant response: 10s base (reading the response) + typing time (~2 chars/sec,
  // capped at 5 min for paste-heavy prompts).
  //
  // We deliberately do NOT sum the raw human→last-assistant wall-clock span: a session
  // left open and resumed across days would count those idle gaps as "Claude time"
  // (e.g. a 4-turn session spanning 4 days read as ~90h). Summing the bounded per-turn
  // estimates instead keeps summary/cc-usage rollups reconciled with the timeline.
  const USER_BASE_MS = 10 * 1000;
  const CHARS_PER_SEC = 2;
  const MAX_TYPING_MS = 5 * 60 * 1000;
  const turns: CCTurn[] = [];
  for (let i = 0; i < msgTimeline.length; i++) {
    const entry = msgTimeline[i];
    if (entry.type !== "user" || !entry.isRealHuman) continue;

    // Only count the turn if an assistant message follows before the next real human
    let hasAssistantResponse = false;
    for (let j = i + 1; j < msgTimeline.length; j++) {
      if (msgTimeline[j].type === "user" && msgTimeline[j].isRealHuman) break;
      if (msgTimeline[j].type === "assistant") { hasAssistantResponse = true; break; }
    }
    if (hasAssistantResponse) {
      const typingMs = Math.min((entry.userChars / CHARS_PER_SEC) * 1000, MAX_TYPING_MS);
      const userTimeMs = USER_BASE_MS + typingMs;
      turns.push({
        timestamp: entry.ts,
        durationSeconds: Math.round(userTimeMs / 1000),
        userChars: entry.userChars,
      });
    }
  }
  // Claude time = sum of the bounded per-turn estimates above (== the timeline's total).
  stats.claudeMinutes = turns.reduce((sum, t) => sum + t.durationSeconds, 0) / 60;
  stats.turns = turns;

  return stats;
}
