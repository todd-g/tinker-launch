import { NextResponse } from "next/server";
import { calendarEvents } from "@/lib/db";

// Ingest calendar events (normalized to ms timestamps). Used by the classify skill,
// which pulls events from the Google Calendar connector and POSTs them here.
// Body: { events: [{ id?, calendarId, title, startTs, endTs, attendees?, location?, source? }] }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const events = body.events;
    if (!Array.isArray(events)) {
      return NextResponse.json({ success: false, error: "events[] required" }, { status: 400 });
    }
    const rows = events
      .filter((e) => e && Number(e.startTs) && Number(e.endTs))
      .map((e) => ({
        id: String(e.id || `${e.calendarId || ""}::${e.startTs}::${String(e.title || "").slice(0, 40)}`),
        calendarId: String(e.calendarId || ""),
        title: String(e.title || ""),
        startTs: Number(e.startTs),
        endTs: Number(e.endTs),
        attendees: String(e.attendees || ""),
        location: String(e.location || ""),
        source: String(e.source || "connector"),
      }));
    calendarEvents.upsertBatch(rows);
    return NextResponse.json({ success: true, ingested: rows.length, total: calendarEvents.count() });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
