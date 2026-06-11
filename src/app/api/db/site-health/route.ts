import { NextResponse } from "next/server";
import { getSiteHealth, runSiteChecksIfStale } from "@/lib/site-health";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "1";
    const days = searchParams.get("days") ? Number(searchParams.get("days")) : 7;

    // Auto-check (throttled to every 10 min) before returning
    await runSiteChecksIfStale({ force });

    const data = getSiteHealth({ days });
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
