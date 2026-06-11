import { NextResponse } from "next/server";
import { jobRuns } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const account = searchParams.get("account") || undefined;
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 25;
    const data = jobRuns.list({ job: "vercel_usage_ingest", account, limit });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
