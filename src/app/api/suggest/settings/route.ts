import { NextResponse } from "next/server";
import {
  getAutoApproveThreshold, setAutoApproveThreshold,
  getAutoRejectThreshold, setAutoRejectThreshold,
} from "@/lib/suggest";

export async function GET() {
  return NextResponse.json({
    success: true,
    autoApproveThreshold: getAutoApproveThreshold(),
    autoRejectThreshold: getAutoRejectThreshold(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.autoApproveThreshold === "number") setAutoApproveThreshold(body.autoApproveThreshold);
    if (typeof body.autoRejectThreshold === "number") setAutoRejectThreshold(body.autoRejectThreshold);
    return NextResponse.json({
      success: true,
      autoApproveThreshold: getAutoApproveThreshold(),
      autoRejectThreshold: getAutoRejectThreshold(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
