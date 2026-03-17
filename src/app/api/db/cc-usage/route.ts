import { NextResponse } from "next/server";
import { ccUsageDaily } from "@/lib/db";
import { runCCParse } from "@/lib/activity";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "1";

    // Auto-parse any new CC session data before returning
    await runCCParse({ force });
    const projectId = searchParams.get("projectId") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const data = ccUsageDaily.list({ projectId, startDate, endDate });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
