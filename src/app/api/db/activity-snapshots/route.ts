import { NextResponse } from "next/server";
import { activitySnapshots } from "@/lib/db";
import { runWindowIngest, ensureDaemonInstalled } from "@/lib/activity";

export async function GET(request: Request) {
  try {
    // Auto-install daemon and ingest any new window data before returning
    ensureDaemonInstalled();
    await runWindowIngest();

    const url = new URL(request.url);

    // Default to reportable-only unless explicitly set to "0" or "all"
    const reportableParam = url.searchParams.get("reportable");
    const reportable = reportableParam === "0" ? false : reportableParam === "all" ? undefined : true;

    const opts = {
      projectId: url.searchParams.get("projectId") || undefined,
      org: url.searchParams.get("org") || undefined,
      source: url.searchParams.get("source") || undefined,
      activityType: url.searchParams.get("activityType") || undefined,
      unassigned: url.searchParams.get("unassigned") === "1" || undefined,
      chromeProfile: url.searchParams.get("chromeProfile") || undefined,
      browserCategory: url.searchParams.get("browserCategory") || undefined,
      slackWorkspace: url.searchParams.get("slackWorkspace") || undefined,
      reportable,
      startDate: url.searchParams.get("startDate") || undefined,
      endDate: url.searchParams.get("endDate") || undefined,
      limit: parseInt(url.searchParams.get("limit") || "200", 10),
      offset: parseInt(url.searchParams.get("offset") || "0", 10),
    };

    // If groupBy is specified, return aggregated summary instead of raw rows
    const groupBy = url.searchParams.get("groupBy");
    if (groupBy) {
      const summary = activitySnapshots.summarize({ ...opts, groupBy });
      return NextResponse.json({ success: true, data: summary });
    }

    const data = activitySnapshots.list(opts);
    const total = activitySnapshots.count(opts);

    return NextResponse.json({ success: true, data, total });
  } catch (error) {
    console.error("Activity snapshots error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
