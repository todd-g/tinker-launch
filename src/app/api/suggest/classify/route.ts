import { NextResponse } from "next/server";
import { assignmentQueue } from "@/lib/db";
import { applyCluster, getAutoApproveThreshold, getAutoRejectThreshold } from "@/lib/suggest";

// The classifier posts its verdict per cluster. `confidence` is confidence in the VERDICT:
//   - projectId set + confidence >= approveThreshold  → auto-applied
//   - projectId null + confidence >= rejectThreshold  → auto-rejected (confident it's personal/not-a-project)
//   - otherwise                                        → "suggested" (lands in the review inbox)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const classifications = body.classifications as Array<{
      id: number; projectId: string | null; confidence: number; reason?: string;
    }>;
    if (!Array.isArray(classifications)) {
      return NextResponse.json({ success: false, error: "classifications[] required" }, { status: 400 });
    }

    const approveThreshold = getAutoApproveThreshold();
    const rejectThreshold = getAutoRejectThreshold();
    let applied = 0, rejected = 0, suggested = 0, skipped = 0;

    for (const c of classifications) {
      const cluster = assignmentQueue.get(c.id);
      if (!cluster || cluster.status === "applied" || cluster.status === "rejected") { skipped++; continue; }
      const conf = typeof c.confidence === "number" ? c.confidence : 0;
      const reason = c.reason || "";
      if (c.projectId && conf >= approveThreshold) {
        applyCluster(c.id, c.projectId);
        assignmentQueue.setSuggestion(c.id, c.projectId, conf, reason, "applied");
        applied++;
      } else if (!c.projectId && conf >= rejectThreshold) {
        assignmentQueue.setSuggestion(c.id, null, conf, reason, "rejected");
        rejected++;
      } else {
        assignmentQueue.setSuggestion(c.id, c.projectId, conf, reason, "suggested");
        suggested++;
      }
    }

    return NextResponse.json({ success: true, applied, rejected, suggested, skipped, approveThreshold, rejectThreshold });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
