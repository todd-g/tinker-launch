#!/usr/bin/env node
/**
 * Pollinator attribution repair.
 *  - Register pollinator-front (report web UI) on port 4000.
 *  - Reassign front-end snaps (localhost:4000 + localhost:3023, Pollinator-titled) -> pollinator-front.
 *  - Reassign Django-admin snaps (localhost:8009, Pollinator-titled) -> existing pollinator-api.
 *  - Rebuild activityDaily for all 4 affected projects from window_tracker snapshots.
 *
 * Does NOT touch the `org`/`chromeProfile` columns (those reflect the Chrome profile, not the project).
 * Runs in BEGIN IMMEDIATE with a busy timeout (dev server holds the WAL).
 */
const path = require("path");
const os = require("os");
const Database = require(path.join(process.cwd(), "node_modules", "better-sqlite3"));

const db = new Database(path.join(os.homedir(), ".tinker-launch", "tinker.db"));
db.pragma("busy_timeout = 8000");
db.pragma("journal_mode = WAL");

const idByRepo = (repo) => {
  const r = db.prepare("SELECT id FROM projects WHERE repoName = ?").get(repo);
  return r ? r.id : null;
};

function rebuildDaily(projectId) {
  db.prepare("DELETE FROM activityDaily WHERE projectId = ?").run(projectId);
  const rows = db.prepare(`
    SELECT date(timestamp/1000,'unixepoch','localtime') d,
      SUM(CASE WHEN activityType='coding'          THEN durationSeconds ELSE 0 END)/60.0 coding,
      SUM(CASE WHEN activityType='browser_local'   THEN durationSeconds ELSE 0 END)/60.0 bl,
      SUM(CASE WHEN activityType='browser_staging' THEN durationSeconds ELSE 0 END)/60.0 bs,
      SUM(CASE WHEN activityType='browser_prod'    THEN durationSeconds ELSE 0 END)/60.0 bp,
      SUM(CASE WHEN activityType='browser_webflow' THEN durationSeconds ELSE 0 END)/60.0 bw,
      SUM(CASE WHEN activityType='xcode'           THEN durationSeconds ELSE 0 END)/60.0 xc,
      SUM(CASE WHEN activityType='slack'           THEN durationSeconds ELSE 0 END)/60.0 sl,
      SUM(durationSeconds)/60.0 total
    FROM activitySnapshots
    WHERE projectId = ? AND source='window_tracker'
    GROUP BY d
  `).all(projectId);
  const ins = db.prepare(`
    INSERT INTO activityDaily (projectId, date, codingMinutes, browserLocalMinutes, browserStagingMinutes,
      browserProdMinutes, browserWebflowMinutes, xcodeMinutes, slackMinutes, totalMinutes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) ins.run(projectId, r.d, r.coding, r.bl, r.bs, r.bp, r.bw, r.xc, r.sl, r.total);
  return rows.length;
}

try {
  db.exec("BEGIN IMMEDIATE");

  // 1. Register pollinator-front (if missing)
  let frontId = idByRepo("pollinator-front");
  if (!frontId) {
    frontId = Buffer.from(require("crypto").randomBytes(16)).toString("hex");
    db.prepare(`
      INSERT INTO projects (id, repoName, projectName, org, description, localPath, githubUrl, port, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'stopped', ?)
    `).run(frontId, "pollinator-front", "Pollinator Front", "minimagroup",
      "Pollinator report web UI (report.pollinator.coop)",
      path.join(os.homedir(), "Documents/GitHub/pollinator-front"),
      "https://github.com/MinimaGroup/pollinator-front", 4000, Date.now());
    console.log(`  created pollinator-front (id ${frontId.slice(0,8)}…) on port 4000`);
  } else {
    console.log(`  pollinator-front already exists (id ${frontId.slice(0,8)}…)`);
  }

  const apiId = idByRepo("pollinator-api");
  const tsId  = idByRepo("tickslayer3000");
  const mbId  = idByRepo("minimabridge");
  if (!apiId || !tsId || !mbId) throw new Error("missing pollinator-api/tickslayer3000/minimabridge");

  // 2. Reassign front-end snaps (4000 + 3023) -> pollinator-front
  const front = db.prepare(`
    UPDATE activitySnapshots
    SET projectId = ?, projectName = 'Pollinator Front', activityType = 'browser_local'
    WHERE lower(windowTitle) LIKE '%pollinator%'
      AND (url LIKE '%localhost:4000%' OR url LIKE '%localhost:3023%')
  `).run(frontId);
  console.log(`  reassigned ${front.changes} front-end snaps -> pollinator-front`);

  // 3. Reassign Django-admin snaps (8009) -> pollinator-api
  const admin = db.prepare(`
    UPDATE activitySnapshots
    SET projectId = ?, projectName = 'Pollinator API', activityType = 'browser_local'
    WHERE lower(windowTitle) LIKE '%pollinator%'
      AND url LIKE '%localhost:8009%'
  `).run(apiId);
  console.log(`  reassigned ${admin.changes} django-admin snaps -> pollinator-api`);

  // 4. Rebuild activityDaily for all affected projects
  for (const [name, id] of [["pollinator-front", frontId], ["pollinator-api", apiId], ["tickslayer3000", tsId], ["minimabridge", mbId]]) {
    const n = rebuildDaily(id);
    console.log(`  rebuilt activityDaily ${name}: ${n} day-rows`);
  }

  db.exec("COMMIT");
  console.log("\nCOMMIT ok.");
} catch (e) {
  db.exec("ROLLBACK");
  console.error("\nROLLBACK:", e.message);
  process.exitCode = 1;
} finally {
  db.close();
}
