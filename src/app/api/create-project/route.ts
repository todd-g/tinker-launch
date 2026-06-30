import { NextResponse } from "next/server";
import { createGitHubRepo, initGitRepo } from "@/lib/github";
import { scaffoldProject } from "@/lib/scaffolding";
import { readCredentials, getGitAuthorForOrg } from "@/lib/credentials";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { repoName, projectName, org, description, port, createRepo = true } = body;

    if (!repoName || !projectName || !org || !description) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    let githubUrl = "";

    if (createRepo) {
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
      githubUrl = ghResult.githubUrl!;
    }

    // Step 2: Scaffold local project (with git author from credentials)
    const credentials = await readCredentials();
    const gitAuthor = getGitAuthorForOrg(credentials, org);

    const scaffoldResult = await scaffoldProject({
      repoName,
      projectName,
      org,
      description,
      port,
      gitAuthor: gitAuthor || undefined,
    });

    if (!scaffoldResult.success) {
      return NextResponse.json(
        { success: false, error: `Scaffold: ${scaffoldResult.error}` },
        { status: 500 }
      );
    }

    // Step 3: Initialize git (only if repo was created)
    if (createRepo) {
      const gitInitialized = await initGitRepo(
        scaffoldResult.localPath,
        githubUrl
      );

      if (!gitInitialized) {
        return NextResponse.json(
          { success: false, error: "Failed to initialize git" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      githubUrl,
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
