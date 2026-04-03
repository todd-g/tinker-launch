import { NextResponse } from "next/server";
import { knowledgeBase } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const type = searchParams.get("type") || undefined;
    const projectId = searchParams.get("projectId") || undefined;
    const search = searchParams.get("search") || undefined;

    if (id) {
      const entry = knowledgeBase.get(id);
      return NextResponse.json({ success: true, entry: entry || null });
    }

    const entries = knowledgeBase.list({ type, projectId, search });
    return NextResponse.json({ success: true, entries, count: entries.length });
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
    const { action } = body;

    if (action === "create") {
      const id = knowledgeBase.create(body.data);
      return NextResponse.json({ success: true, id });
    }

    if (action === "update") {
      knowledgeBase.update(body.id, body.data);
      return NextResponse.json({ success: true });
    }

    if (action === "remove") {
      knowledgeBase.remove(body.id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
