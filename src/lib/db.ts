import Database from "better-sqlite3";
import path from "path";
import os from "os";

const DB_PATH = path.join(os.homedir(), ".tinker-launch", "tinker.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const fs = require("fs");
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      repoName TEXT NOT NULL,
      projectName TEXT NOT NULL,
      org TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      localPath TEXT NOT NULL,
      githubUrl TEXT NOT NULL DEFAULT '',
      port INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'stopped',
      pid INTEGER,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org);
    CREATE INDEX IF NOT EXISTS idx_projects_port ON projects(port);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_repoName ON projects(repoName);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activitySnapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      app TEXT NOT NULL,
      windowTitle TEXT NOT NULL,
      bundleId TEXT NOT NULL,
      projectId TEXT,
      projectName TEXT,
      activityType TEXT NOT NULL DEFAULT 'other'
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON activitySnapshots(timestamp);
    CREATE INDEX IF NOT EXISTS idx_snapshots_project_timestamp ON activitySnapshots(projectId, timestamp);
    CREATE INDEX IF NOT EXISTS idx_snapshots_org_timestamp ON activitySnapshots(org, timestamp);
    CREATE INDEX IF NOT EXISTS idx_snapshots_source ON activitySnapshots(source);

    CREATE TABLE IF NOT EXISTS activityDaily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId TEXT NOT NULL,
      date TEXT NOT NULL,
      codingMinutes REAL NOT NULL DEFAULT 0,
      browserLocalMinutes REAL NOT NULL DEFAULT 0,
      browserStagingMinutes REAL NOT NULL DEFAULT 0,
      browserProdMinutes REAL NOT NULL DEFAULT 0,
      xcodeMinutes REAL NOT NULL DEFAULT 0,
      totalMinutes REAL NOT NULL DEFAULT 0,
      UNIQUE(projectId, date)
    );

    CREATE INDEX IF NOT EXISTS idx_activityDaily_date ON activityDaily(date);

    CREATE TABLE IF NOT EXISTS ccUsageDaily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId TEXT NOT NULL,
      date TEXT NOT NULL,
      inputTokens INTEGER NOT NULL DEFAULT 0,
      outputTokens INTEGER NOT NULL DEFAULT 0,
      cacheCreationTokens INTEGER NOT NULL DEFAULT 0,
      cacheReadTokens INTEGER NOT NULL DEFAULT 0,
      userMessageCount INTEGER NOT NULL DEFAULT 0,
      assistantMessageCount INTEGER NOT NULL DEFAULT 0,
      sessionCount INTEGER NOT NULL DEFAULT 0,
      totalDurationMinutes REAL NOT NULL DEFAULT 0,
      totalClaudeMinutes REAL NOT NULL DEFAULT 0,
      UNIQUE(projectId, date)
    );

    CREATE INDEX IF NOT EXISTS idx_ccUsageDaily_date ON ccUsageDaily(date);

    CREATE TABLE IF NOT EXISTS ccSessionStats (
      sessionId TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      date TEXT NOT NULL,
      inputTokens INTEGER NOT NULL DEFAULT 0,
      outputTokens INTEGER NOT NULL DEFAULT 0,
      cacheCreationTokens INTEGER NOT NULL DEFAULT 0,
      cacheReadTokens INTEGER NOT NULL DEFAULT 0,
      humanMessageCount INTEGER NOT NULL DEFAULT 0,
      assistantMessageCount INTEGER NOT NULL DEFAULT 0,
      claudeMinutes REAL NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_ccSessionStats_project_date ON ccSessionStats(projectId, date);

    CREATE TABLE IF NOT EXISTS orgSlackDaily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      org TEXT NOT NULL,
      workspace TEXT NOT NULL,
      channel TEXT NOT NULL,
      channelType TEXT NOT NULL DEFAULT 'unknown',
      minutes REAL NOT NULL DEFAULT 0,
      UNIQUE(date, org, workspace, channel)
    );

    CREATE INDEX IF NOT EXISTS idx_orgSlackDaily_date ON orgSlackDaily(date);
    CREATE INDEX IF NOT EXISTS idx_orgSlackDaily_org ON orgSlackDaily(org);

    CREATE TABLE IF NOT EXISTS orgBrowserDaily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      org TEXT NOT NULL,
      chromeProfile TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'browsing',
      minutes REAL NOT NULL DEFAULT 0,
      UNIQUE(date, org, category)
    );

    CREATE INDEX IF NOT EXISTS idx_orgBrowserDaily_date ON orgBrowserDaily(date);
    CREATE INDEX IF NOT EXISTS idx_orgBrowserDaily_org ON orgBrowserDaily(org);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS orgSettings (
      org TEXT PRIMARY KEY,
      displayName TEXT NOT NULL DEFAULT '',
      slackWorkspace TEXT NOT NULL DEFAULT '',
      chromeProfile TEXT NOT NULL DEFAULT '',
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledgeBase (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      type TEXT NOT NULL CHECK(type IN ('decision', 'pattern', 'learning')),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '',
      projectId TEXT,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_kb_type ON knowledgeBase(type);
    CREATE INDEX IF NOT EXISTS idx_kb_project ON knowledgeBase(projectId);
  `);

  // Migrations — add columns that may not exist yet
  const migrations = [
    "ALTER TABLE projects ADD COLUMN prodUrl TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN stagingUrl TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN aliases TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ccUsageDaily ADD COLUMN totalClaudeMinutes REAL NOT NULL DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN linearSlug TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE activitySnapshots ADD COLUMN url TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE activityDaily ADD COLUMN slackMinutes REAL NOT NULL DEFAULT 0",
    // Enrich activitySnapshots into a unified activity log
    "ALTER TABLE activitySnapshots ADD COLUMN source TEXT NOT NULL DEFAULT 'window_tracker'",
    "ALTER TABLE activitySnapshots ADD COLUMN durationSeconds INTEGER NOT NULL DEFAULT 10",
    "ALTER TABLE activitySnapshots ADD COLUMN org TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE activitySnapshots ADD COLUMN chromeProfile TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE activitySnapshots ADD COLUMN browserCategory TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE activitySnapshots ADD COLUMN slackWorkspace TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE activitySnapshots ADD COLUMN slackChannel TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE activitySnapshots ADD COLUMN slackChannelType TEXT NOT NULL DEFAULT ''",
    // CC turn fields
    "ALTER TABLE activitySnapshots ADD COLUMN ccSessionId TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE activitySnapshots ADD COLUMN ccUserChars INTEGER NOT NULL DEFAULT 0",
    // Flag non-reportable entries (e.g. window_tracker coding snapshots — just means Terminal was open, not real coding signal)
    "ALTER TABLE activitySnapshots ADD COLUMN reportable INTEGER NOT NULL DEFAULT 1",
    // Backfill: mark existing window_tracker coding entries as non-reportable
    "UPDATE activitySnapshots SET reportable = 0 WHERE source = 'window_tracker' AND activityType = 'coding'",
    // Archive support
    "ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
    // Webflow project support
    "ALTER TABLE projects ADD COLUMN webflowSlug TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE activityDaily ADD COLUMN browserWebflowMinutes REAL NOT NULL DEFAULT 0",
    // Neon API key lookup — free-form slug the user chooses to key credentials.yaml.neon_keys
    "ALTER TABLE projects ADD COLUMN neonOrgSlug TEXT NOT NULL DEFAULT ''",
    // Automated session detection (e.g. /loop)
    "ALTER TABLE ccSessionStats ADD COLUMN isAutomated INTEGER NOT NULL DEFAULT 0",
    // Backfill: mark CC turns from automated sessions as non-reportable
    "UPDATE activitySnapshots SET reportable = 0 WHERE source = 'cc_transcript' AND ccSessionId IN (SELECT sessionId FROM ccSessionStats WHERE isAutomated = 1)",
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }
}

// ──────────────────────────────────────────────
// Projects
// ──────────────────────────────────────────────

export interface DbProject {
  id: string;
  repoName: string;
  projectName: string;
  org: string;
  description: string;
  localPath: string;
  githubUrl: string;
  port: number;
  status: "running" | "stopped" | "unknown";
  pid: number | null;
  createdAt: number;
  prodUrl: string;
  stagingUrl: string;
  aliases: string; // comma-separated alternative names for matching
  linearSlug: string; // Linear workspace slug for matching linear.app/{slug}/...
  webflowSlug: string; // Webflow site slug for matching {slug}.design.webflow.com etc.
  neonOrgSlug: string; // Slug used to look up NEON_API_KEY in credentials.yaml.neon_keys
  archived: number; // 0 = active, 1 = archived
}

export const projects = {
  list(org?: string, opts?: { includeArchived?: boolean }): DbProject[] {
    const db = getDb();
    const archiveClause = opts?.includeArchived ? "" : " AND archived = 0";
    if (org) {
      return db.prepare(`SELECT * FROM projects WHERE org = ?${archiveClause} ORDER BY port`).all(org) as DbProject[];
    }
    return db.prepare(`SELECT * FROM projects WHERE 1=1${archiveClause} ORDER BY port`).all() as DbProject[];
  },

  get(id: string): DbProject | undefined {
    const db = getDb();
    return db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as DbProject | undefined;
  },

  getByRepoName(repoName: string): DbProject | undefined {
    const db = getDb();
    return db.prepare("SELECT * FROM projects WHERE repoName = ?").get(repoName) as DbProject | undefined;
  },

  getNextPort(): number {
    const db = getDb();
    const result = db.prepare("SELECT MAX(port) as maxPort FROM projects").get() as { maxPort: number | null };
    return (result.maxPort ?? 3000) + 1;
  },

  create(data: {
    repoName: string;
    projectName: string;
    org: string;
    description: string;
    localPath: string;
    githubUrl: string;
    port: number;
  }): string {
    const db = getDb();
    const id = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex");
    db.prepare(`
      INSERT INTO projects (id, repoName, projectName, org, description, localPath, githubUrl, port, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'stopped', ?)
    `).run(id, data.repoName, data.projectName, data.org, data.description, data.localPath, data.githubUrl, data.port, Date.now());
    return id;
  },

  updateStatus(id: string, status: string, pid?: number): void {
    const db = getDb();
    db.prepare("UPDATE projects SET status = ?, pid = ? WHERE id = ?").run(status, pid ?? null, id);
  },

  updateOrg(id: string, org: string): void {
    const db = getDb();
    db.prepare("UPDATE projects SET org = ? WHERE id = ?").run(org, id);
  },

  updateUrls(id: string, prodUrl: string, stagingUrl: string): void {
    const db = getDb();
    db.prepare("UPDATE projects SET prodUrl = ?, stagingUrl = ? WHERE id = ?").run(prodUrl, stagingUrl, id);
  },

  updateAliases(id: string, aliases: string): void {
    const db = getDb();
    db.prepare("UPDATE projects SET aliases = ? WHERE id = ?").run(aliases, id);
  },

  updateLinearSlug(id: string, linearSlug: string): void {
    const db = getDb();
    db.prepare("UPDATE projects SET linearSlug = ? WHERE id = ?").run(linearSlug, id);
  },

  updateArchived(id: string, archived: boolean): void {
    const db = getDb();
    db.prepare("UPDATE projects SET archived = ? WHERE id = ?").run(archived ? 1 : 0, id);
  },

  update(id: string, fields: Partial<Pick<DbProject, "projectName" | "description" | "prodUrl" | "stagingUrl" | "aliases" | "linearSlug" | "webflowSlug" | "neonOrgSlug" | "org" | "port" | "localPath" | "githubUrl">>): void {
    const db = getDb();
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;
    const setClauses = entries.map(([k]) => `${k} = ?`).join(", ");
    const values = entries.map(([, v]) => v);
    db.prepare(`UPDATE projects SET ${setClauses} WHERE id = ?`).run(...values, id);
  },

  remove(id: string): void {
    const db = getDb();
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  },
};

// ──────────────────────────────────────────────
// Settings
// ──────────────────────────────────────────────

export const settings = {
  get(key: string): unknown {
    const db = getDb();
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    if (!row) return undefined;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  },

  getAll(): Record<string, unknown> {
    const db = getDb();
    const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        result[row.key] = row.value;
      }
    }
    return result;
  },

  set(key: string, value: unknown): void {
    const db = getDb();
    const serialized = typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, serialized);
  },
};

// ──────────────────────────────────────────────
// Activity Snapshots
// ──────────────────────────────────────────────

export interface DbSnapshot {
  id?: number;
  timestamp: number;
  app: string;
  windowTitle: string;
  bundleId: string;
  projectId?: string;
  projectName?: string;
  activityType: string;
  url?: string;
  source?: string;
  durationSeconds?: number;
  org?: string;
  chromeProfile?: string;
  browserCategory?: string;
  slackWorkspace?: string;
  slackChannel?: string;
  slackChannelType?: string;
  ccSessionId?: string;
  ccUserChars?: number;
  reportable?: number;
}

export interface SnapshotQueryOpts {
  projectId?: string;
  org?: string;
  source?: string;            // "window_tracker" | "cc_transcript"
  activityType?: string;      // "coding" | "browser_local" | "cc_turn" | "slack" | etc.
  unassigned?: boolean;       // true = no projectId
  chromeProfile?: string;
  browserCategory?: string;   // "email" | "docs" | "browsing"
  slackWorkspace?: string;
  reportable?: boolean;    // true = only reportable entries (default behavior for UI)
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

function buildSnapshotQuery(select: string, opts?: SnapshotQueryOpts): { sql: string; params: unknown[] } {
  let sql = `${select} FROM activitySnapshots WHERE 1=1`;
  const params: unknown[] = [];

  if (opts?.projectId) { sql += " AND projectId = ?"; params.push(opts.projectId); }
  if (opts?.org) { sql += " AND org = ?"; params.push(opts.org); }
  if (opts?.source) { sql += " AND source = ?"; params.push(opts.source); }
  if (opts?.activityType) { sql += " AND activityType = ?"; params.push(opts.activityType); }
  if (opts?.unassigned) { sql += " AND (projectId IS NULL OR projectId = '')"; }
  if (opts?.chromeProfile) { sql += " AND chromeProfile = ?"; params.push(opts.chromeProfile); }
  if (opts?.browserCategory) { sql += " AND browserCategory = ?"; params.push(opts.browserCategory); }
  if (opts?.slackWorkspace) { sql += " AND slackWorkspace = ?"; params.push(opts.slackWorkspace); }
  if (opts?.reportable !== undefined) { sql += " AND reportable = ?"; params.push(opts.reportable ? 1 : 0); }
  if (opts?.startDate) {
    sql += " AND timestamp >= ?";
    params.push(new Date(opts.startDate + "T00:00:00").getTime());
  }
  if (opts?.endDate) {
    sql += " AND timestamp <= ?";
    params.push(new Date(opts.endDate + "T23:59:59.999").getTime());
  }

  return { sql, params };
}

export const activitySnapshots = {
  insertBatch(snapshots: DbSnapshot[]): void {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO activitySnapshots (timestamp, app, windowTitle, bundleId, projectId, projectName, activityType, url,
        source, durationSeconds, org, chromeProfile, browserCategory, slackWorkspace, slackChannel, slackChannelType,
        ccSessionId, ccUserChars, reportable)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((items: DbSnapshot[]) => {
      for (const s of items) {
        stmt.run(
          s.timestamp, s.app, s.windowTitle, s.bundleId,
          s.projectId ?? null, s.projectName ?? null, s.activityType, s.url ?? "",
          s.source ?? "window_tracker", s.durationSeconds ?? 10,
          s.org ?? "", s.chromeProfile ?? "", s.browserCategory ?? "",
          s.slackWorkspace ?? "", s.slackChannel ?? "", s.slackChannelType ?? "",
          s.ccSessionId ?? "", s.ccUserChars ?? 0,
          s.reportable ?? 1,
        );
      }
    });
    insertMany(snapshots);
  },

  list(opts?: SnapshotQueryOpts): DbSnapshot[] {
    const db = getDb();
    const { sql, params } = buildSnapshotQuery("SELECT *", opts);
    let query = sql + " ORDER BY timestamp DESC";

    if (opts?.limit) {
      query += " LIMIT ?";
      params.push(opts.limit);
      if (opts?.offset) {
        query += " OFFSET ?";
        params.push(opts.offset);
      }
    }

    return db.prepare(query).all(...params) as DbSnapshot[];
  },

  count(opts?: SnapshotQueryOpts): number {
    const db = getDb();
    const { sql, params } = buildSnapshotQuery("SELECT COUNT(*) as count", opts);
    return (db.prepare(sql).get(...params) as { count: number }).count;
  },

  /** Aggregate minutes by a grouping field */
  summarize(opts?: SnapshotQueryOpts & { groupBy?: string }): Array<Record<string, unknown>> {
    const db = getDb();
    const groupCol = opts?.groupBy || "activityType";
    const { sql: whereSql, params } = buildSnapshotQuery("SELECT 1", opts);
    const whereClause = whereSql.replace(/^SELECT 1 FROM activitySnapshots\s*/i, "");
    const sql = `SELECT ${groupCol}, COUNT(*) as entries, round(SUM(durationSeconds)/60.0, 1) as minutes FROM activitySnapshots ${whereClause} GROUP BY ${groupCol} ORDER BY minutes DESC`;
    return db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  },

  listRecent(limit: number = 100) {
    const db = getDb();
    return db.prepare("SELECT * FROM activitySnapshots ORDER BY timestamp DESC LIMIT ?").all(limit);
  },

  listUnmatched(): DbSnapshot[] {
    const db = getDb();
    return db.prepare("SELECT * FROM activitySnapshots WHERE (projectId IS NULL OR projectId = '') ORDER BY timestamp DESC").all() as DbSnapshot[];
  },

  updateMatch(id: number, projectId: string, projectName: string, activityType: string): void {
    const db = getDb();
    db.prepare("UPDATE activitySnapshots SET projectId = ?, projectName = ?, activityType = ? WHERE id = ?").run(projectId, projectName, activityType, id);
  },

  updateMatchFull(id: number, fields: {
    projectId?: string; projectName?: string; activityType?: string;
    org?: string; slackWorkspace?: string; slackChannel?: string; slackChannelType?: string;
  }): void {
    const db = getDb();
    db.prepare(`UPDATE activitySnapshots SET projectId = ?, projectName = ?, activityType = ?, org = ?, slackWorkspace = ?, slackChannel = ?, slackChannelType = ? WHERE id = ?`).run(
      fields.projectId ?? null, fields.projectName ?? "", fields.activityType ?? "other",
      fields.org ?? "", fields.slackWorkspace ?? "", fields.slackChannel ?? "", fields.slackChannelType ?? "",
      id,
    );
  },

  deleteOlderThan(cutoffTimestamp: number): number {
    const db = getDb();
    const result = db.prepare("DELETE FROM activitySnapshots WHERE timestamp < ?").run(cutoffTimestamp);
    return result.changes;
  },
};

// ──────────────────────────────────────────────
// Activity Daily
// ──────────────────────────────────────────────

export interface DbActivityDaily {
  id: number;
  projectId: string;
  date: string;
  codingMinutes: number;
  browserLocalMinutes: number;
  browserStagingMinutes: number;
  browserProdMinutes: number;
  browserWebflowMinutes: number;
  xcodeMinutes: number;
  slackMinutes: number;
  totalMinutes: number;
}

export const activityDaily = {
  upsert(data: Omit<DbActivityDaily, "id">): void {
    const db = getDb();
    db.prepare(`
      INSERT INTO activityDaily (projectId, date, codingMinutes, browserLocalMinutes, browserStagingMinutes, browserProdMinutes, browserWebflowMinutes, xcodeMinutes, slackMinutes, totalMinutes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(projectId, date) DO UPDATE SET
        codingMinutes = codingMinutes + excluded.codingMinutes,
        browserLocalMinutes = browserLocalMinutes + excluded.browserLocalMinutes,
        browserStagingMinutes = browserStagingMinutes + excluded.browserStagingMinutes,
        browserProdMinutes = browserProdMinutes + excluded.browserProdMinutes,
        browserWebflowMinutes = browserWebflowMinutes + excluded.browserWebflowMinutes,
        xcodeMinutes = xcodeMinutes + excluded.xcodeMinutes,
        slackMinutes = slackMinutes + excluded.slackMinutes,
        totalMinutes = totalMinutes + excluded.totalMinutes
    `).run(data.projectId, data.date, data.codingMinutes, data.browserLocalMinutes, data.browserStagingMinutes, data.browserProdMinutes, data.browserWebflowMinutes, data.xcodeMinutes, data.slackMinutes, data.totalMinutes);
  },

  list(opts?: { projectId?: string; startDate?: string; endDate?: string }): DbActivityDaily[] {
    const db = getDb();
    let sql = "SELECT * FROM activityDaily WHERE 1=1";
    const params: unknown[] = [];

    if (opts?.projectId) {
      sql += " AND projectId = ?";
      params.push(opts.projectId);
    }
    if (opts?.startDate) {
      sql += " AND date >= ?";
      params.push(opts.startDate);
    }
    if (opts?.endDate) {
      sql += " AND date <= ?";
      params.push(opts.endDate);
    }

    sql += " ORDER BY date";
    return db.prepare(sql).all(...params) as DbActivityDaily[];
  },
};

// ──────────────────────────────────────────────
// CC Usage Daily
// ──────────────────────────────────────────────

export interface DbCCUsageDaily {
  id: number;
  projectId: string;
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  userMessageCount: number;
  assistantMessageCount: number;
  sessionCount: number;
  totalClaudeMinutes: number;
}

export const ccUsageDaily = {
  /** Rebuild all daily totals from ccSessionStats for the given projectId+date pairs. */
  rebuildFromSessions(affectedKeys: Array<{ projectId: string; date: string }>): void {
    const db = getDb();
    const unique = [...new Map(affectedKeys.map((k) => [`${k.projectId}:${k.date}`, k])).values()];
    const rebuild = db.transaction(() => {
      for (const { projectId, date } of unique) {
        const row = db.prepare(`
          SELECT
            COUNT(*) as sessionCount,
            SUM(inputTokens) as inputTokens,
            SUM(outputTokens) as outputTokens,
            SUM(cacheCreationTokens) as cacheCreationTokens,
            SUM(cacheReadTokens) as cacheReadTokens,
            SUM(humanMessageCount) as humanMessageCount,
            SUM(assistantMessageCount) as assistantMessageCount,
            SUM(claudeMinutes) as claudeMinutes
          FROM ccSessionStats
          WHERE projectId = ? AND date = ?
        `).get(projectId, date) as Record<string, number> | undefined;

        if (!row || row.sessionCount === 0) {
          db.prepare("DELETE FROM ccUsageDaily WHERE projectId = ? AND date = ?").run(projectId, date);
        } else {
          db.prepare(`
            INSERT INTO ccUsageDaily (projectId, date, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, userMessageCount, assistantMessageCount, sessionCount, totalClaudeMinutes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(projectId, date) DO UPDATE SET
              inputTokens = excluded.inputTokens,
              outputTokens = excluded.outputTokens,
              cacheCreationTokens = excluded.cacheCreationTokens,
              cacheReadTokens = excluded.cacheReadTokens,
              userMessageCount = excluded.userMessageCount,
              assistantMessageCount = excluded.assistantMessageCount,
              sessionCount = excluded.sessionCount,
              totalClaudeMinutes = excluded.totalClaudeMinutes
          `).run(projectId, date, row.inputTokens ?? 0, row.outputTokens ?? 0, row.cacheCreationTokens ?? 0, row.cacheReadTokens ?? 0, row.humanMessageCount ?? 0, row.assistantMessageCount ?? 0, row.sessionCount, row.claudeMinutes ?? 0);
        }
      }
    });
    rebuild();
  },

  list(opts?: { projectId?: string; startDate?: string; endDate?: string }): DbCCUsageDaily[] {
    const db = getDb();
    let sql = "SELECT * FROM ccUsageDaily WHERE 1=1";
    const params: unknown[] = [];

    if (opts?.projectId) {
      sql += " AND projectId = ?";
      params.push(opts.projectId);
    }
    if (opts?.startDate) {
      sql += " AND date >= ?";
      params.push(opts.startDate);
    }
    if (opts?.endDate) {
      sql += " AND date <= ?";
      params.push(opts.endDate);
    }

    sql += " ORDER BY date";
    return db.prepare(sql).all(...params) as DbCCUsageDaily[];
  },

  clear(): void {
    const db = getDb();
    db.exec("DELETE FROM ccUsageDaily");
  },
};

// ──────────────────────────────────────────────
// CC Session Stats
// ──────────────────────────────────────────────

export interface DbCCSessionStats {
  sessionId: string;
  projectId: string;
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  humanMessageCount: number;
  assistantMessageCount: number;
  claudeMinutes: number;
  isAutomated?: boolean;
}

export const ccSessionStats = {
  upsert(data: DbCCSessionStats): void {
    const db = getDb();
    db.prepare(`
      INSERT INTO ccSessionStats (sessionId, projectId, date, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, humanMessageCount, assistantMessageCount, claudeMinutes, isAutomated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sessionId) DO UPDATE SET
        projectId = excluded.projectId,
        date = excluded.date,
        inputTokens = excluded.inputTokens,
        outputTokens = excluded.outputTokens,
        cacheCreationTokens = excluded.cacheCreationTokens,
        cacheReadTokens = excluded.cacheReadTokens,
        humanMessageCount = excluded.humanMessageCount,
        assistantMessageCount = excluded.assistantMessageCount,
        claudeMinutes = excluded.claudeMinutes,
        isAutomated = excluded.isAutomated
    `).run(data.sessionId, data.projectId, data.date, data.inputTokens, data.outputTokens, data.cacheCreationTokens, data.cacheReadTokens, data.humanMessageCount, data.assistantMessageCount, data.claudeMinutes, data.isAutomated ? 1 : 0);
  },

  clear(): void {
    const db = getDb();
    db.exec("DELETE FROM ccSessionStats");
  },
};

// ──────────────────────────────────────────────
// Org Slack Daily
// ──────────────────────────────────────────────

export interface DbOrgSlackDaily {
  id: number;
  date: string;
  org: string;
  workspace: string;
  channel: string;
  channelType: string;
  minutes: number;
}

export const orgSlackDaily = {
  upsert(data: Omit<DbOrgSlackDaily, "id">): void {
    const db = getDb();
    db.prepare(`
      INSERT INTO orgSlackDaily (date, org, workspace, channel, channelType, minutes)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(date, org, workspace, channel) DO UPDATE SET
        minutes = minutes + excluded.minutes
    `).run(data.date, data.org, data.workspace, data.channel, data.channelType, data.minutes);
  },

  list(opts?: { org?: string; startDate?: string; endDate?: string }): DbOrgSlackDaily[] {
    const db = getDb();
    let sql = "SELECT * FROM orgSlackDaily WHERE 1=1";
    const params: unknown[] = [];

    if (opts?.org) {
      sql += " AND org = ?";
      params.push(opts.org);
    }
    if (opts?.startDate) {
      sql += " AND date >= ?";
      params.push(opts.startDate);
    }
    if (opts?.endDate) {
      sql += " AND date <= ?";
      params.push(opts.endDate);
    }

    sql += " ORDER BY date, org, minutes DESC";
    return db.prepare(sql).all(...params) as DbOrgSlackDaily[];
  },

  clear(): void {
    const db = getDb();
    db.exec("DELETE FROM orgSlackDaily");
  },
};

// ──────────────────────────────────────────────
// Org Browser Daily
// ──────────────────────────────────────────────

export interface DbOrgBrowserDaily {
  id: number;
  date: string;
  org: string;
  chromeProfile: string;
  category: string;
  minutes: number;
}

export const orgBrowserDaily = {
  upsert(data: Omit<DbOrgBrowserDaily, "id">): void {
    const db = getDb();
    db.prepare(`
      INSERT INTO orgBrowserDaily (date, org, chromeProfile, category, minutes)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(date, org, category) DO UPDATE SET
        minutes = minutes + excluded.minutes
    `).run(data.date, data.org, data.chromeProfile, data.category, data.minutes);
  },

  list(opts?: { org?: string; startDate?: string; endDate?: string }): DbOrgBrowserDaily[] {
    const db = getDb();
    let sql = "SELECT * FROM orgBrowserDaily WHERE 1=1";
    const params: unknown[] = [];

    if (opts?.org) {
      sql += " AND org = ?";
      params.push(opts.org);
    }
    if (opts?.startDate) {
      sql += " AND date >= ?";
      params.push(opts.startDate);
    }
    if (opts?.endDate) {
      sql += " AND date <= ?";
      params.push(opts.endDate);
    }

    sql += " ORDER BY date, org, minutes DESC";
    return db.prepare(sql).all(...params) as DbOrgBrowserDaily[];
  },

  clear(): void {
    const db = getDb();
    db.exec("DELETE FROM orgBrowserDaily");
  },
};

// ──────────────────────────────────────────────
// Org Settings
// ──────────────────────────────────────────────

export interface DbOrgSettings {
  org: string;
  displayName: string;
  slackWorkspace: string;
  chromeProfile: string;
  updatedAt: number;
}

export const orgSettings = {
  list(): DbOrgSettings[] {
    const db = getDb();
    return db.prepare("SELECT * FROM orgSettings ORDER BY org").all() as DbOrgSettings[];
  },

  get(org: string): DbOrgSettings | undefined {
    const db = getDb();
    return db.prepare("SELECT * FROM orgSettings WHERE org = ?").get(org) as DbOrgSettings | undefined;
  },

  upsert(data: Omit<DbOrgSettings, "updatedAt">): void {
    const db = getDb();
    db.prepare(`
      INSERT INTO orgSettings (org, displayName, slackWorkspace, chromeProfile, updatedAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(org) DO UPDATE SET
        displayName = excluded.displayName,
        slackWorkspace = excluded.slackWorkspace,
        chromeProfile = excluded.chromeProfile,
        updatedAt = excluded.updatedAt
    `).run(data.org, data.displayName, data.slackWorkspace, data.chromeProfile, Date.now());
  },

  remove(org: string): void {
    const db = getDb();
    db.prepare("DELETE FROM orgSettings WHERE org = ?").run(org);
  },
};

// ──────────────────────────────────────────────
// Knowledge Base
// ──────────────────────────────────────────────

export interface DbKBEntry {
  id: string;
  type: "decision" | "pattern" | "learning";
  title: string;
  content: string;
  tags: string; // comma-separated
  projectId: string | null;
  createdAt: number;
  updatedAt: number;
}

export const knowledgeBase = {
  list(opts?: { type?: string; projectId?: string; search?: string }): DbKBEntry[] {
    const db = getDb();
    let sql = "SELECT * FROM knowledgeBase WHERE 1=1";
    const params: unknown[] = [];

    if (opts?.type) {
      sql += " AND type = ?";
      params.push(opts.type);
    }
    if (opts?.projectId) {
      sql += " AND projectId = ?";
      params.push(opts.projectId);
    }
    if (opts?.search) {
      sql += " AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)";
      const q = `%${opts.search}%`;
      params.push(q, q, q);
    }

    sql += " ORDER BY updatedAt DESC";
    return db.prepare(sql).all(...params) as DbKBEntry[];
  },

  get(id: string): DbKBEntry | undefined {
    const db = getDb();
    return db.prepare("SELECT * FROM knowledgeBase WHERE id = ?").get(id) as DbKBEntry | undefined;
  },

  create(data: { type: string; title: string; content: string; tags?: string; projectId?: string }): string {
    const db = getDb();
    const id = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex");
    const now = Date.now();
    db.prepare(`
      INSERT INTO knowledgeBase (id, type, title, content, tags, projectId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.type, data.title, data.content, data.tags || "", data.projectId || null, now, now);
    return id;
  },

  update(id: string, data: Partial<Pick<DbKBEntry, "type" | "title" | "content" | "tags" | "projectId">>): void {
    const db = getDb();
    const entries = Object.entries(data).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;
    const setClauses = [...entries.map(([k]) => `${k} = ?`), "updatedAt = ?"].join(", ");
    const values = [...entries.map(([, v]) => v), Date.now()];
    db.prepare(`UPDATE knowledgeBase SET ${setClauses} WHERE id = ?`).run(...values, id);
  },

  remove(id: string): void {
    const db = getDb();
    db.prepare("DELETE FROM knowledgeBase WHERE id = ?").run(id);
  },
};
