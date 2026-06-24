import fs from "fs";
import path from "path";

/**
 * Port-drift detection helpers.
 *
 * The dev-server bind port is the source of truth for activity matching
 * (`matchWindowToProject` keys `localhost:PORT` off the registry `port`).
 * When the registry, the package.json dev script, and `.tinker.yaml` disagree,
 * localhost activity is misattributed or dropped. These helpers surface that drift.
 */

export interface PortConfig {
  id: string;
  repoName: string;
  projectName: string;
  localPath: string;
  registryPort: number;
  configPort: number | null; // port parsed from the package.json dev script
  configBasis: string;       // how configPort was derived (for display/debugging)
  yamlPort: number | null;   // port declared in .tinker.yaml
}

const YAML_NAMES = [".tinker.yaml", ".tinker-launch.yaml", "tinker.yaml"];

/** Extract an explicit port from a single shell command, or null. */
function portFromCmd(cmd: string): { port: number; basis: string } | null {
  let m = cmd.match(/(?:^|\s)-p[ =](\d{2,5})/);
  if (m) return { port: parseInt(m[1], 10), basis: `-p ${m[1]}` };
  m = cmd.match(/--port[ =](\d{2,5})/);
  if (m) return { port: parseInt(m[1], 10), basis: `--port ${m[1]}` };
  // shell default form: -p ${PORT:-8016}
  m = cmd.match(/\$\{PORT:-(\d{2,5})\}/);
  if (m) return { port: parseInt(m[1], 10), basis: `\${PORT:-${m[1]}}` };
  m = cmd.match(/(?:^|\s)PORT[ =](\d{2,5})/);
  if (m) return { port: parseInt(m[1], 10), basis: `PORT=${m[1]}` };
  return null;
}

/**
 * Parse the real dev-server port from package.json scripts.
 * Handles -p/--port flags, `${PORT:-N}` shell defaults, orchestrator scripts
 * (npm-run-all/concurrently that delegate to a `dev:next`-style sub-script),
 * and framework defaults (Next 3000, Vite 5173).
 */
export function parseDevPort(scripts: Record<string, string> | undefined): { port: number | null; basis: string } {
  if (!scripts) return { port: null, basis: "no scripts" };

  const order = ["dev", "start", "serve"];
  let cmd: string | null = null;
  let which = "";
  for (const c of order) {
    if (scripts[c]) { cmd = scripts[c]; which = c; break; }
  }
  if (!cmd) {
    for (const [k, v] of Object.entries(scripts)) {
      if (/next dev|vite|react-scripts start/.test(v)) { cmd = v; which = k; break; }
    }
  }
  if (!cmd) return { port: null, basis: "no dev script" };

  const direct = portFromCmd(cmd);
  if (direct) return { port: direct.port, basis: `${which}: ${direct.basis}` };

  // Orchestrator (e.g. `npm-run-all --parallel dev:convex dev:next`): the real
  // port lives in a sub-script. Scan every script for an explicit port.
  for (const [k, v] of Object.entries(scripts)) {
    const sub = portFromCmd(v);
    if (sub) return { port: sub.port, basis: `${k}: ${sub.basis}` };
  }

  if (/next dev|next start/.test(cmd)) return { port: 3000, basis: `${which}: next default 3000` };
  if (/\bvite\b/.test(cmd)) return { port: 5173, basis: `${which}: vite default 5173` };
  return { port: null, basis: `${which}: unparsed` };
}

/** Read the dev port from a project's package.json on disk. */
export function readDevPort(localPath: string): { port: number | null; basis: string } {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(localPath, "package.json"), "utf-8"));
    return parseDevPort(pkg.scripts);
  } catch (e: unknown) {
    const code = (e as { code?: string } | null)?.code;
    return { port: null, basis: code === "ENOENT" ? "no package.json" : "package.json parse error" };
  }
}

/** Read the declared `port:` from a project's .tinker.yaml, or null. */
export function parseYamlPort(localPath: string): number | null {
  for (const n of YAML_NAMES) {
    const fp = path.join(localPath, n);
    if (!fs.existsSync(fp)) continue;
    try {
      const m = fs.readFileSync(fp, "utf-8").match(/^\s*port:\s*(\d+)/m);
      return m ? parseInt(m[1], 10) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Rewrite the `port:` line in a project's .tinker.yaml to newPort. Returns true if a port line was updated. */
export function syncYamlPort(localPath: string, newPort: number): boolean {
  for (const n of YAML_NAMES) {
    const fp = path.join(localPath, n);
    if (!fs.existsSync(fp)) continue;
    try {
      const content = fs.readFileSync(fp, "utf-8");
      if (!/^\s*port:\s*\d+/m.test(content)) return false;
      fs.writeFileSync(fp, content.replace(/^(\s*port:\s*)\d+/m, `$1${newPort}`), "utf-8");
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
