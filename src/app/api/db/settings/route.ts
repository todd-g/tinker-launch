import { NextResponse } from "next/server";
import { settings } from "@/lib/db";

export async function GET() {
  try {
    const all = settings.getAll();
    return NextResponse.json({ success: true, settings: all });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { key, value } = body;
    settings.set(key, value);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
