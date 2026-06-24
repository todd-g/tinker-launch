import { NextResponse } from "next/server";
import { projects } from "@/lib/db";
import { readDevPort, parseYamlPort, syncYamlPort, type PortConfig } from "@/lib/port-drift";

/**
 * GET — per-project port configuration (registry vs package.json vs .tinker.yaml)
 * for every non-archived project. The client merges in the live listening port
 * (from /api/scan-ports cwd matching) to compute drift.
 */
export async function GET() {
  try {
    const configs: PortConfig[] = projects.list().map((p) => {
      const dev = readDevPort(p.localPath);
      return {
        id: p.id,
        repoName: p.repoName,
        projectName: p.projectName,
        localPath: p.localPath,
        registryPort: p.port,
        configPort: dev.port,
        configBasis: dev.basis,
        yamlPort: parseYamlPort(p.localPath),
      };
    });
    return NextResponse.json({ success: true, configs });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * POST { projectId, targetPort } — reconcile a project's registry port to the
 * detected real port, with a collision guard, and sync its .tinker.yaml.
 */
export async function POST(request: Request) {
  try {
    const { projectId, targetPort } = await request.json();
    if (!projectId || !Number.isInteger(targetPort)) {
      return NextResponse.json(
        { success: false, error: "projectId and an integer targetPort are required" },
        { status: 400 }
      );
    }

    const proj = projects.get(projectId);
    if (!proj) {
      return NextResponse.json({ success: false, error: "project not found" }, { status: 404 });
    }

    // Collision guard — no OTHER non-archived project may already hold targetPort.
    const collision = projects.list().find((p) => p.id !== projectId && p.port === targetPort);
    if (collision) {
      return NextResponse.json(
        { success: false, error: `port ${targetPort} is already used by ${collision.repoName}` },
        { status: 409 }
      );
    }

    projects.update(projectId, { port: targetPort });
    const yamlSynced = syncYamlPort(proj.localPath, targetPort);

    return NextResponse.json({ success: true, fromPort: proj.port, toPort: targetPort, yamlSynced });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
