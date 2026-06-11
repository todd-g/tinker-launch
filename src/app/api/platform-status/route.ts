import { NextResponse } from "next/server";

// Public statuspage.io JSON APIs — platform-level status + active incidents
const STATUS_PAGES = [
  { platform: "vercel", url: "https://www.vercel-status.com/api/v2/summary.json" },
  { platform: "convex", url: "https://status.convex.dev/api/v2/summary.json" },
];

interface StatusSummary {
  platform: string;
  indicator: string; // none | minor | major | critical
  description: string;
  incidents: Array<{ name: string; status: string; startedAt: string; url: string }>;
}

export async function GET() {
  const results: StatusSummary[] = await Promise.all(
    STATUS_PAGES.map(async ({ platform, url }) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return {
          platform,
          indicator: data.status?.indicator ?? "unknown",
          description: data.status?.description ?? "Unknown",
          incidents: (data.incidents ?? []).map(
            (i: { name: string; status: string; started_at: string; shortlink: string }) => ({
              name: i.name,
              status: i.status,
              startedAt: i.started_at,
              url: i.shortlink,
            })
          ),
        };
      } catch {
        return { platform, indicator: "unknown", description: "Status unavailable", incidents: [] };
      }
    })
  );
  return NextResponse.json({ success: true, platforms: results });
}
