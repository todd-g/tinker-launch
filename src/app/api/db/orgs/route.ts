import { NextResponse } from "next/server";
import { orgSettings } from "@/lib/db";

export async function GET() {
  try {
    const list = orgSettings.list();
    return NextResponse.json({ success: true, orgs: list });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "upsert") {
      orgSettings.upsert({
        org: body.org,
        displayName: body.displayName ?? "",
        slackWorkspace: body.slackWorkspace ?? "",
        chromeProfile: body.chromeProfile ?? "",
      });
      return NextResponse.json({ success: true });
    }

    if (action === "remove") {
      orgSettings.remove(body.org);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
