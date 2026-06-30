import { NextResponse } from "next/server";
import { matchCalendarForPending } from "@/lib/suggest";

// Deterministically match pending meeting/Zoom/Meet/huddle clusters against stored
// calendar events (by time overlap + project named in the title/attendees).
export async function POST() {
  try {
    const res = matchCalendarForPending();
    return NextResponse.json({ success: true, ...res });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
