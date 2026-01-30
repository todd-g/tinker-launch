import { NextResponse } from "next/server";
import { createGitHubRepo, initGitRepo } from "@/lib/github";
import { scaffoldProject } from "@/lib/scaffolding";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { repoName, projectName, org, description, port } = body;

    if (!repoName || !projectName || !org || !description) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Step 1: Create GitHub repo
    const ghResult = await createGitHubRepo({
      repoName,
      org,
      description,
      isPrivate: true,
    });

    if (!ghResult.success) {
      return NextResponse.json(
        { success: false, error: `GitHub: ${ghResult.error}` },
        { status: 500 }
      );
    }

    // Step 2: Scaffold local project
    const scaffoldResult = await scaffoldProject({
      repoName,
      projectName,
      org,
      description,
      port,
    });

    if (!scaffoldResult.success) {
      return NextResponse.json(
        { success: false, error: `Scaffold: ${scaffoldResult.error}` },
        { status: 500 }
      );
    }

    // Step 3: Initialize git
    const gitInitialized = await initGitRepo(
      scaffoldResult.localPath,
      ghResult.githubUrl!
    );

    if (!gitInitialized) {
      return NextResponse.json(
        { success: false, error: "Failed to initialize git" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      githubUrl: ghResult.githubUrl,
      localPath: scaffoldResult.localPath,
    });
  } catch (error) {
    console.error("Create project error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
