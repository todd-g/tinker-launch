import { NextResponse } from "next/server";
import { usageDaily } from "@/lib/db";
import { runUsageIngestIfStale, getEnabledUsageAccounts } from "@/lib/usage";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "1";

    // Auto-ingest (throttled to every 6h) before returning, like cc-usage
    await runUsageIngestIfStale({ force });

    const account = searchParams.get("account") || undefined;
    const provider = searchParams.get("provider") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const data = usageDaily.list({ account, provider, startDate, endDate });
    return NextResponse.json({
      success: true,
      data,
      accounts: getEnabledUsageAccounts(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
