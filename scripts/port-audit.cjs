#!/usr/bin/env node
/**
 * Port drift audit — compares each project's registry `port` (SQLite) against the
 * real port parsed from <localPath>/package.json dev script.
 *
 * READ-ONLY. Prints a report; makes no changes.
 */
const path = require("path");
const os = require("os");
const fs = require("fs");
const Database = require(path.join(process.cwd(), "node_modules", "better-sqlite3"));

const DB_PATH = path.join(os.homedir(), ".tinker-launch", "tinker.db");
const db = new Database(DB_PATH, { readonly: true });
db.pragma("busy_timeout = 5000");

/**
 * Parse the real dev-server port from a package.json scripts.dev (and related) string.
 * Returns { port: number|null, basis: string }.
 */
function parsePort(scripts) {
  if (!scripts) return { port: null, basis: "no scripts" };
  // Prefer dev, then start, then any script that runs a known dev server
  const candidates = ["dev", "start", "serve"];
  let cmd = null;
  let which = null;
  for (const c of candidates) {
    if (scripts[c]) { cmd = scripts[c]; which = c; break; }
  }
  if (!cmd) {
    // look for any script mentioning next dev / vite
    for (const [k, v] of Object.entries(scripts)) {
      if (/next dev|vite|react-scripts start|expo start/.test(v)) { cmd = v; which = k; break; }
    }
  }
  if (!cmd) return { port: null, basis: "no dev/start script" };

  // explicit flags
  let m = cmd.match(/(?:^|\s)-p[ =](\d{2,5})/);
  if (m) return { port: parseInt(m[1], 10), basis: `${which}: -p ${m[1]}` };
  m = cmd.match(/--port[ =](\d{2,5})/);
  if (m) return { port: parseInt(m[1], 10), basis: `${which}: --port ${m[1]}` };
  // shell default: -p ${PORT:-8016} or ${PORT:-8016}
  m = cmd.match(/\$\{PORT:-(\d{2,5})\}/);
  if (m) return { port: parseInt(m[1], 10), basis: `${which}: \${PORT:-${m[1]}}` };
  m = cmd.match(/(?:^|\s)PORT[ =](\d{2,5})/);
  if (m) return { port: parseInt(m[1], 10), basis: `${which}: PORT=${m[1]}` };

  // framework defaults when no explicit flag
  if (/next dev|next start/.test(cmd)) return { port: 3000, basis: `${which}: next default 3000` };
  if (/\bvite\b/.test(cmd)) return { port: 5173, basis: `${which}: vite default 5173` };
  if (/react-scripts start/.test(cmd)) return { port: 3000, basis: `${which}: CRA default 3000` };
  if (/expo start/.test(cmd)) return { port: null, basis: `${which}: expo (no web port)` };

  return { port: null, basis: `${which}: unparsed -> "${cmd.slice(0, 60)}"` };
}

const rows = db.prepare("SELECT id, port, repoName, projectName, org, status, archived, localPath FROM projects ORDER BY port, repoName").all();

const results = [];
for (const p of rows) {
  const pkgPath = path.join(p.localPath, "package.json");
  let real = null, basis = "package.json not found", rawDev = "";
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const parsed = parsePort(pkg.scripts || {});
    real = parsed.port;
    basis = parsed.basis;
    rawDev = (pkg.scripts && pkg.scripts.dev) || "";
  } catch (e) {
    if (e.code === "ENOENT") basis = "package.json not found";
    else basis = "parse error: " + e.message;
  }
  results.push({ ...p, real, basis, rawDev });
}

// ── Mismatch report ──
console.log("\n=== PORT DRIFT AUDIT (non-archived) ===\n");
const active = results.filter((r) => !r.archived);
const mismatches = active.filter((r) => r.real != null && r.real !== r.port);
const undetermined = active.filter((r) => r.real == null);

function pad(s, n) { s = String(s); return s.length >= n ? s : s + " ".repeat(n - s.length); }

console.log(pad("repoName", 22) + pad("reg", 6) + pad("real", 6) + "basis");
console.log("-".repeat(80));
for (const r of active) {
  const flag = r.real == null ? " ?" : (r.real !== r.port ? " <-- MISMATCH" : "");
  console.log(pad(r.repoName, 22) + pad(r.port, 6) + pad(r.real == null ? "?" : r.real, 6) + r.basis + flag);
}

console.log("\n=== MISMATCHES (non-archived) ===");
if (mismatches.length === 0) console.log("(none)");
for (const r of mismatches) {
  console.log(`  ${r.repoName}: registry ${r.port} -> real ${r.real}   [${r.basis}]`);
}

console.log("\n=== UNDETERMINED real port (non-archived) ===");
for (const r of undetermined) {
  console.log(`  ${r.repoName}: registry ${r.port}   [${r.basis}]   dev="${r.rawDev}"`);
}

// ── Collision report: duplicate registry ports among non-archived ──
console.log("\n=== REGISTRY PORT COLLISIONS (non-archived) ===");
const byPort = {};
for (const r of active) { (byPort[r.port] ||= []).push(r.repoName); }
let anyCollision = false;
for (const [port, names] of Object.entries(byPort)) {
  if (names.length > 1) { anyCollision = true; console.log(`  port ${port}: ${names.join(", ")}`); }
}
if (!anyCollision) console.log("(none)");

// ── Simulate post-fix collisions: what the port map looks like if we apply real ports ──
console.log("\n=== POST-FIX COLLISION CHECK (apply real ports to non-archived) ===");
const proposed = {};
for (const r of active) {
  const target = r.real != null ? r.real : r.port; // keep current if undetermined
  (proposed[target] ||= []).push(`${r.repoName}${r.real != null && r.real !== r.port ? `(was ${r.port})` : ""}`);
}
let anyProposedCollision = false;
for (const [port, names] of Object.entries(proposed)) {
  if (names.length > 1) { anyProposedCollision = true; console.log(`  port ${port}: ${names.join(", ")}`); }
}
if (!anyProposedCollision) console.log("(none — every non-archived project unique)");

// ── Cross-check against archived projects squatting on a real port we want ──
console.log("\n=== ARCHIVED projects occupying a port some active project's REAL port needs ===");
const archived = results.filter((r) => r.archived);
const neededReal = new Set(mismatches.map((m) => m.real));
let anyArch = false;
for (const a of archived) {
  if (neededReal.has(a.port)) { anyArch = true; console.log(`  port ${a.port}: archived ${a.repoName} (active project wants this real port)`); }
}
if (!anyArch) console.log("(none — archived projects don't block, and matcher ignores archived anyway)");

db.close();
