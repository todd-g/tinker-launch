import { NextResponse } from "next/server";
import { assignmentQueue } from "@/lib/db";

// List the queue for the review UI.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const day = searchParams.get("day") || undefined;
    const data = assignmentQueue.list({ status, day });
    const counts = assignmentQueue.counts();
    return NextResponse.json({ success: true, data, counts });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
