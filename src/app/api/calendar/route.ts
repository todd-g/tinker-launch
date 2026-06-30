import { NextResponse } from "next/server";
import { calendarEvents } from "@/lib/db";

// Observability: recent calendar events held for matching.
export async function GET() {
  try {
    return NextResponse.json({ success: true, count: calendarEvents.count(), data: calendarEvents.list({}).slice(0, 200) });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
