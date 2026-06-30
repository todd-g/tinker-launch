import { NextResponse } from "next/server";
import { assignmentQueue } from "@/lib/db";
import { applyCluster } from "@/lib/suggest";

// Human approve/reject from the review inbox. Approve applies the assignment
// (using the suggested project, or an override projectId). Reject suppresses re-suggestion.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const decisions = body.decisions as Array<{ id: number; action: "approve" | "reject"; projectId?: string }>;
    if (!Array.isArray(decisions)) {
      return NextResponse.json({ success: false, error: "decisions[] required" }, { status: 400 });
    }

    let approved = 0, rejected = 0, skipped = 0;
    for (const d of decisions) {
      const cluster = assignmentQueue.get(d.id);
      if (!cluster || cluster.status === "applied") { skipped++; continue; }
      if (d.action === "approve") {
        const pid = d.projectId || cluster.suggestedProjectId;
        if (!pid) { skipped++; continue; }
        applyCluster(d.id, pid);
        assignmentQueue.setSuggestion(d.id, pid, cluster.confidence ?? 1, cluster.reason || "manual approval", "applied");
        approved++;
      } else {
        assignmentQueue.setStatus(d.id, "rejected");
        rejected++;
      }
    }

    return NextResponse.json({ success: true, approved, rejected, skipped });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
