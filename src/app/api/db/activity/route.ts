import { NextResponse } from "next/server";
import { activityDaily } from "@/lib/db";
import { runWindowIngest, ensureDaemonInstalled } from "@/lib/activity";

export async function GET(request: Request) {
  try {
    // Auto-install daemon and ingest any new window data before returning
    ensureDaemonInstalled();
    await runWindowIngest();

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const data = activityDaily.list({ projectId, startDate, endDate });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
