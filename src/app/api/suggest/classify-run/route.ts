import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { jobRuns } from "@/lib/db";

// Spawn the LLM classifier locally: `claude -p "/classify-unassigned"`. Runs async (the child
// outlives the request in the long-lived `next start` process); the jobRun is finished by the
// child's 'close' handler. The UI polls /api/suggest/runs for status.
//
// Caveat: a headless subprocess may not carry interactively-authed MCP connectors (Google
// Calendar), so the skill's calendar *sync* step may be skipped here — it still classifies using
// already-ingested calendar events + URL/title/adjacency. Run /classify-unassigned interactively
// for a fresh calendar pull.
export async function POST() {
  // Don't allow overlapping runs.
  const recent = jobRuns.list({ job: "assign_classify", limit: 1 });
  if (recent[0]?.status === "running") {
    return NextResponse.json({ success: false, error: "A classifier run is already in progress." }, { status: 409 });
  }

  const jobId = jobRuns.start("assign_classify");
  try {
    const child = spawn(
      "claude",
      ["-p", "/classify-unassigned", "--permission-mode", "bypassPermissions", "--output-format", "json"],
      // stdio[0]='ignore' closes stdin → avoids the 3s "no stdin" wait + warning that corrupts JSON output.
      { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] }
    );

    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => { err += d.toString(); });
    child.on("error", (e) => {
      jobRuns.finish(jobId, "error", `spawn failed: ${e.message} (is the 'claude' CLI on the server PATH?)`);
    });
    child.on("close", (code) => {
      let summary = out.slice(-1500);
      try {
        const j = JSON.parse(out);
        // --output-format json may return the final result object or an array of messages.
        const last = Array.isArray(j) ? j[j.length - 1] : j;
        summary = String(last?.result ?? last?.subtype ?? summary).slice(0, 1500);
      } catch { /* keep raw tail */ }
      jobRuns.finish(jobId, code === 0 ? "success" : "error", {
        exitCode: code,
        summary,
        stderr: err.slice(-400),
      });
    });

    return NextResponse.json({ success: true, jobId, started: true });
  } catch (error) {
    jobRuns.finish(jobId, "error", String(error));
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
