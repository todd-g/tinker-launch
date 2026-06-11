import { NextResponse } from "next/server";
import { runSiteChecks } from "@/lib/site-health";

export async function POST() {
  try {
    const result = await runSiteChecks();
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
