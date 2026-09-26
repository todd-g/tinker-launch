import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Accept numbers or numeric strings; anything else is rejected before it
// reaches lsof/kill.
function toPositiveInt(value: unknown, max = Number.MAX_SAFE_INTEGER): number | null {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n > 0 && n <= max ? n : null;
}

export async function POST(request: Request) {
  try {
    const { pid, port } = await request.json();

    if (!pid && !port) {
      return NextResponse.json(
        { success: false, error: "PID or port required" },
        { status: 400 }
      );
    }

    const pidNum = pid ? toPositiveInt(pid) : null;
    const portNum = port ? toPositiveInt(port, 65535) : null;
    if ((pid && pidNum === null) || (port && portNum === null)) {
      return NextResponse.json(
        { success: false, error: "PID must be a positive integer and port must be 1-65535" },
        { status: 400 }
      );
    }

    let targetPid = pidNum;

    // If port provided instead of PID, find the PID
    if (!targetPid && portNum) {
      let stdout = "";
      try {
        ({ stdout } = await execFileAsync("lsof", ["-i", `:${portNum}`, "-t", "-sTCP:LISTEN"]));
      } catch {
        // lsof exits non-zero when nothing is listening
      }
      targetPid = parseInt(stdout.trim().split("\n")[0], 10);
      if (isNaN(targetPid)) {
        return NextResponse.json(
          { success: false, error: `No process found on port ${portNum}` },
          { status: 404 }
        );
      }
    }

    // Kill the process (SIGTERM first, allows graceful shutdown)
    process.kill(targetPid!, "SIGTERM");

    return NextResponse.json({ success: true, pid: targetPid });
  } catch (error) {
    console.error("Kill process error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to kill process" },
      { status: 500 }
    );
  }
}
