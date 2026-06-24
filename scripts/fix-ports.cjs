#!/usr/bin/env node
/**
 * Apply confirmed registry port corrections.
 * Guards: verifies current port matches expectation, checks for collisions among
 * NON-ARCHIVED projects after applying, runs inside BEGIN IMMEDIATE with a busy timeout
 * (dev server on 3001 may hold the WAL concurrently).
 */
const path = require("path");
const os = require("os");
const Database = require(path.join(process.cwd(), "node_modules", "better-sqlite3"));

const FIXES = [
  { repoName: "laudeslearning", expectOld: 3005, newPort: 3008 },
  { repoName: "opsworx",        expectOld: 3005, newPort: 3006 },
];

const db = new Database(path.join(os.homedir(), ".tinker-launch", "tinker.db"));
db.pragma("busy_timeout = 8000");
db.pragma("journal_mode = WAL");

const getByRepo = db.prepare("SELECT id, repoName, port, archived FROM projects WHERE repoName = ?");
const update = db.prepare("UPDATE projects SET port = ? WHERE id = ?");

try {
  db.exec("BEGIN IMMEDIATE");

  // Pre-checks
  for (const f of FIXES) {
    const row = getByRepo.get(f.repoName);
    if (!row) throw new Error(`project ${f.repoName} not found`);
    if (row.port !== f.expectOld) throw new Error(`${f.repoName} port is ${row.port}, expected ${f.expectOld} — aborting (already changed?)`);
    f.id = row.id;
  }

  // Apply
  for (const f of FIXES) {
    update.run(f.newPort, f.id);
    console.log(`  ${f.repoName}: ${f.expectOld} -> ${f.newPort}`);
  }

  // Post-check: no duplicate ports among NON-ARCHIVED projects
  const dups = db.prepare(`
    SELECT port, GROUP_CONCAT(repoName) names, COUNT(*) c
    FROM projects WHERE archived = 0
    GROUP BY port HAVING c > 1
  `).all();
  if (dups.length > 0) {
    throw new Error("collision among non-archived after fix: " + JSON.stringify(dups));
  }

  db.exec("COMMIT");
  console.log("\nCOMMIT ok — no non-archived collisions.");
} catch (e) {
  db.exec("ROLLBACK");
  console.error("\nROLLBACK:", e.message);
  process.exitCode = 1;
} finally {
  db.close();
}
