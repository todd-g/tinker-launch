import { NextResponse } from "next/server";
import { analyzeMessages, loadAllSessionIndices } from "@/lib/messages";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "analyze";
    const maxSessions = parseInt(searchParams.get("maxSessions") || "100");

    if (action === "sessions") {
      const { sessions } = await loadAllSessionIndices();
      return NextResponse.json({ success: true, sessions, count: sessions.length });
    }

    // Default: full analysis
    const analysis = await analyzeMessages(maxSessions);
    return NextResponse.json({ success: true, analysis });
  } catch (error) {
    console.error("Message analysis error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
