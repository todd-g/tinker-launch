import { NextResponse } from "next/server";
import { projects } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const org = searchParams.get("org") || undefined;
    const id = searchParams.get("id");
    const repoName = searchParams.get("repoName");
    const action = searchParams.get("action");

    if (action === "nextPort") {
      return NextResponse.json({ success: true, port: projects.getNextPort() });
    }

    if (id) {
      const project = projects.get(id);
      return NextResponse.json({ success: true, project: project || null });
    }

    if (repoName) {
      const project = projects.getByRepoName(repoName);
      return NextResponse.json({ success: true, project: project || null });
    }

    const includeArchived = searchParams.get("includeArchived") === "true";
    const list = projects.list(org, { includeArchived });
    return NextResponse.json({ success: true, projects: list });
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
      const id = projects.create(body.data);
      return NextResponse.json({ success: true, id });
    }

    if (action === "updateStatus") {
      projects.updateStatus(body.id, body.status, body.pid);
      return NextResponse.json({ success: true });
    }

    if (action === "updateOrg") {
      projects.updateOrg(body.id, body.org);
      return NextResponse.json({ success: true });
    }

    if (action === "updateUrls") {
      projects.updateUrls(body.id, body.prodUrl ?? "", body.stagingUrl ?? "");
      return NextResponse.json({ success: true });
    }

    if (action === "updateAliases") {
      projects.updateAliases(body.id, body.aliases ?? "");
      return NextResponse.json({ success: true });
    }

    if (action === "updateLinearSlug") {
      projects.updateLinearSlug(body.id, body.linearSlug ?? "");
      return NextResponse.json({ success: true });
    }

    if (action === "update") {
      const allowed = ["projectName", "description", "prodUrl", "stagingUrl", "aliases", "linearSlug", "org", "port", "localPath", "githubUrl"] as const;
      const fields: Record<string, unknown> = {};
      for (const key of allowed) {
        if (body[key] !== undefined) fields[key] = body[key];
      }
      projects.update(body.id, fields as Parameters<typeof projects.update>[1]);
      return NextResponse.json({ success: true });
    }

    if (action === "archive") {
      projects.updateArchived(body.id, true);
      return NextResponse.json({ success: true });
    }

    if (action === "unarchive") {
      projects.updateArchived(body.id, false);
      return NextResponse.json({ success: true });
    }

    if (action === "remove") {
      projects.remove(body.id);
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
