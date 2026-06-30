import { NextResponse } from "next/server";
import { pendingPayload } from "@/lib/suggest";

// Compact payload for the classifier (Claude Code skill / Gemini): pending clusters,
// the project list (with slugs/URLs), and per-cluster neighbor hints.
export async function GET() {
  try {
    return NextResponse.json({ success: true, ...pendingPayload() });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
