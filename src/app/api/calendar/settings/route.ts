import { NextResponse } from "next/server";
import {
  getCalendarSyncIds, setCalendarSyncIds,
  getCalendarAvailable, setCalendarAvailable,
  type CalendarRef,
} from "@/lib/suggest";

// Which calendars to sync + the available list. The classify skill pushes `available`
// (from the connector's list_calendars) and reads `syncIds`; the UI manages `syncIds`.
export async function GET() {
  return NextResponse.json({ success: true, syncIds: getCalendarSyncIds(), available: getCalendarAvailable() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (Array.isArray(body.syncIds)) setCalendarSyncIds(body.syncIds as string[]);
    if (Array.isArray(body.available)) {
      const cals = (body.available as CalendarRef[])
        .filter((c) => c && typeof c.id === "string")
        .map((c) => ({ id: c.id, summary: String(c.summary || c.id) }));
      setCalendarAvailable(cals);
    }
    return NextResponse.json({ success: true, syncIds: getCalendarSyncIds(), available: getCalendarAvailable() });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
