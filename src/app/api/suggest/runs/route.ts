import { NextResponse } from "next/server";
import { jobRuns } from "@/lib/db";

// Recent assigner runs: queue rebuilds (assign_queue_build) + LLM classifier runs (assign_classify).
export async function GET() {
  try {
    const runs = [
      ...jobRuns.list({ job: "assign_queue_build", limit: 12 }),
      ...jobRuns.list({ job: "assign_classify", limit: 12 }),
    ].sort((a, b) => b.startedAt - a.startedAt).slice(0, 15);
    const running = runs.some((r) => r.status === "running");
    return NextResponse.json({ success: true, runs, running });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
