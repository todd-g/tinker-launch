#!/usr/bin/env node
/** Scan every registered project's .tinker.yaml `port:` field vs the registry port. READ-ONLY. */
const path = require("path"), os = require("os"), fs = require("fs");
const Database = require(path.join(process.cwd(), "node_modules", "better-sqlite3"));
const db = new Database(path.join(os.homedir(), ".tinker-launch", "tinker.db"), { readonly: true });
const rows = db.prepare("SELECT repoName, port, localPath, archived FROM projects ORDER BY port").all();
const names = [".tinker.yaml", ".tinker-launch.yaml", "tinker.yaml"];
console.log("repo                  reg   yaml  status");
console.log("-".repeat(55));
for (const p of rows) {
  let yamlPort = null, found = null;
  for (const n of names) {
    const fp = path.join(p.localPath, n);
    if (fs.existsSync(fp)) {
      found = n;
      const m = fs.readFileSync(fp, "utf-8").match(/^\s*port:\s*(\d+)/m);
      if (m) yamlPort = parseInt(m[1], 10);
      break;
    }
  }
  const arch = p.archived ? " (archived)" : "";
  let status;
  if (!found) status = "no yaml";
  else if (yamlPort == null) status = "yaml has no port:";
  else if (yamlPort !== p.port) status = `DRIFT (yaml ${yamlPort} != reg ${p.port})`;
  else status = "ok";
  if (status !== "ok" && status !== "no yaml")
    console.log(`${p.repoName.padEnd(22)}${String(p.port).padEnd(6)}${String(yamlPort ?? "-").padEnd(6)}${status}${arch}`);
}
db.close();
