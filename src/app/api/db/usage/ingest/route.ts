import { NextResponse } from "next/server";
import { runVercelUsageIngest, getEnabledUsageAccounts } from "@/lib/usage";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const account = typeof body.account === "string" ? body.account : undefined;
    const days = typeof body.days === "number" ? Math.min(body.days, 365) : undefined;

    const accounts = account ? [account] : getEnabledUsageAccounts();
    const results = [];
    for (const acct of accounts) {
      results.push(await runVercelUsageIngest(acct, { days }));
    }
    return NextResponse.json({ success: true, results });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
