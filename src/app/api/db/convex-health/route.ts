import { NextResponse } from "next/server";
import { getConvexHealth } from "@/lib/convex-health";

export async function GET() {
  try {
    const deployments = await getConvexHealth();
    return NextResponse.json({ success: true, deployments });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
