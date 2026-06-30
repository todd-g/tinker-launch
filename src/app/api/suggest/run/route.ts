import { NextResponse } from "next/server";
import { buildQueue } from "@/lib/suggest";
import { jobRuns } from "@/lib/db";
import { runWindowIngest, ensureDaemonInstalled } from "@/lib/activity";

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// (Re)build the assignment queue from unassigned reportable snapshots.
// Defaults to a recent window (last `days`, default 3) and skips sub-`minMinutes` noise.
// Pass ?startDate=&endDate= for a one-time historical backfill, or ?days=N / ?minMinutes=N.
export async function POST(request: Request) {
  const jobId = jobRuns.start("assign_queue_build");
  try {
    const { searchParams } = new URL(request.url);
    ensureDaemonInstalled();
    await runWindowIngest();

    let startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    if (!startDate && !endDate) {
      const days = parseInt(searchParams.get("days") || "3", 10);
      const d = new Date();
      d.setDate(d.getDate() - (Number.isFinite(days) ? days - 1 : 2));
      startDate = toLocalDateString(d);
    }
    const minMinutes = parseFloat(searchParams.get("minMinutes") || "2");

    const res = buildQueue({ startDate, endDate, minMinutes });
    jobRuns.finish(jobId, "success", { ...res, startDate, endDate, minMinutes });
    return NextResponse.json({ success: true, ...res, window: { startDate, endDate, minMinutes } });
  } catch (error) {
    jobRuns.finish(jobId, "error", String(error));
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
