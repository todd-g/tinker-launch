import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { pid, port } = await request.json();

    if (!pid && !port) {
      return NextResponse.json(
        { success: false, error: "PID or port required" },
        { status: 400 }
      );
    }

    let targetPid = pid;

    // If port provided instead of PID, find the PID
    if (!targetPid && port) {
      const { stdout } = await execAsync(
        `lsof -i :${port} -t -sTCP:LISTEN 2>/dev/null`
      );
      targetPid = parseInt(stdout.trim().split("\n")[0], 10);
      if (isNaN(targetPid)) {
        return NextResponse.json(
          { success: false, error: `No process found on port ${port}` },
          { status: 404 }
        );
      }
    }

    // Kill the process (SIGTERM first, allows graceful shutdown)
    await execAsync(`kill ${targetPid}`);

    return NextResponse.json({ success: true, pid: targetPid });
  } catch (error) {
    console.error("Kill process error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to kill process" },
      { status: 500 }
    );
  }
}
