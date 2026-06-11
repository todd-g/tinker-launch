"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDbQuery } from "@/hooks/use-db";
import { AlertTriangle, Database, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, YAxis } from "recharts";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface ConvexFunctionCalls {
  fn: string;
  calls: number;
  p50Ms: number | null;
  p95Ms: number | null;
}

interface ConvexFailure {
  fn: string;
  failurePct: number;
}

interface DeploymentHealth {
  projectSlug: string;
  org: string;
  deployment: string;
  totalCalls24h: number;
  hourlyCalls: Array<{ t: number; calls: number }>;
  topFunctions: ConvexFunctionCalls[];
  failures: ConvexFailure[];
  error: string | null;
}

interface PlatformStatus {
  platform: string;
  indicator: string;
  description: string;
  incidents: Array<{ name: string; status: string; startedAt: string; url: string }>;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function shortFn(fn: string): string {
  // "calendarSync/_internal_sync.js:getCalendar" -> "_internal_sync:getCalendar"
  const file = fn.split("/").pop() ?? fn;
  return file.replace(".js:", ":");
}

function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatCalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function indicatorDot(indicator: string): string {
  if (indicator === "none") return "bg-green-500";
  if (indicator === "minor") return "bg-amber-500";
  if (indicator === "unknown") return "bg-muted-foreground";
  return "bg-red-500";
}

function CallsSparkline({ data }: { data: Array<{ t: number; calls: number }> }) {
  if (data.length < 2) return null;
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <YAxis hide domain={[0, "dataMax"]} />
          <Bar dataKey="calls" fill="#3b82f6" radius={[1, 1, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ──────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────

export default function ConvexHealthPage() {
  const [refreshing, setRefreshing] = useState(false);

  const { data, refetch } = useDbQuery<{ success: boolean; deployments: DeploymentHealth[] }>(
    "/api/db/convex-health"
  );
  const { data: statusData } = useDbQuery<{ success: boolean; platforms: PlatformStatus[] }>(
    "/api/platform-status"
  );

  const deployments = useMemo(() => data?.deployments ?? [], [data]);
  const platforms = statusData?.platforms ?? [];

  const totalCalls = deployments.reduce((sum, d) => sum + d.totalCalls24h, 0);
  const failingFns = deployments.flatMap((d) =>
    d.failures.map((f) => ({ ...f, projectSlug: d.projectSlug }))
  ).sort((a, b) => b.failurePct - a.failurePct);
  const erroredDeployments = deployments.filter((d) => d.error);

  async function refresh() {
    setRefreshing(true);
    try {
      refetch();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Platform status banners */}
      <div className="flex flex-wrap gap-2">
        {platforms.map((p) => (
          <div
            key={p.platform}
            className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
          >
            <span className={`inline-block h-2 w-2 rounded-full ${indicatorDot(p.indicator)}`} />
            <span className="font-medium capitalize">{p.platform}</span>
            <span className="text-muted-foreground">{p.description}</span>
            {p.incidents.map((inc) => (
              <a
                key={inc.url}
                href={inc.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-amber-600 hover:underline dark:text-amber-500"
              >
                {inc.name}
              </a>
            ))}
          </div>
        ))}
        <div className="ml-auto">
          <Button size="sm" variant="outline" disabled={refreshing} onClick={refresh}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Function Calls (24h)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatCalls(totalCalls)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Deployments</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{deployments.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Functions With Failures</CardDescription>
            <CardTitle
              className={`text-2xl tabular-nums ${failingFns.length > 0 ? "text-amber-600 dark:text-amber-500" : ""}`}
            >
              {failingFns.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Unreachable</CardDescription>
            <CardTitle
              className={`text-2xl tabular-nums ${erroredDeployments.length > 0 ? "text-destructive" : ""}`}
            >
              {erroredDeployments.length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Worst failures across all deployments */}
      {failingFns.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-500" />
              Failing Functions (24h)
            </CardTitle>
            <CardDescription className="text-xs">
              Failure percentage per function, worst first
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {failingFns.slice(0, 8).map((f) => (
              <div key={`${f.projectSlug}-${f.fn}`} className="flex items-center gap-2 text-sm">
                <Badge variant={f.failurePct > 15 ? "destructive" : "secondary"} className="tabular-nums">
                  {f.failurePct.toFixed(1)}%
                </Badge>
                <span className="font-mono text-xs">{shortFn(f.fn)}</span>
                <span className="text-xs text-muted-foreground">{f.projectSlug}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Per-deployment cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {deployments.length === 0 && (
          <Card className="lg:col-span-2">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              <Database className="mx-auto mb-2 size-5 opacity-50" />
              No production Convex deployments found in credentials.yaml
            </CardContent>
          </Card>
        )}
        {deployments.map((d) => (
          <Card key={d.deployment} className={d.error ? "border-destructive/40" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-medium">
                <span className="flex items-center gap-2">
                  {d.projectSlug}
                  {d.org && (
                    <Badge variant="outline" className="text-xs font-normal">
                      {d.org}
                    </Badge>
                  )}
                </span>
                <span className="tabular-nums text-base">{formatCalls(d.totalCalls24h)} calls</span>
              </CardTitle>
              <CardDescription className="text-xs">{d.deployment} · last 24h</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {d.error ? (
                <div className="text-sm text-destructive">{d.error}</div>
              ) : (
                <>
                  <CallsSparkline data={d.hourlyCalls} />
                  {d.topFunctions.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {d.topFunctions.map((f) => (
                        <div key={f.fn} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-mono">{shortFn(f.fn)}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {formatCalls(f.calls)} · p50 {formatMs(f.p50Ms)} · p95 {formatMs(f.p95Ms)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {d.failures.length > 0 && (
                    <div className="flex flex-col gap-1 border-t pt-2">
                      {d.failures.map((f) => (
                        <div key={f.fn} className="flex items-center gap-2 text-xs">
                          <Badge
                            variant={f.failurePct > 15 ? "destructive" : "secondary"}
                            className="tabular-nums"
                          >
                            {f.failurePct.toFixed(1)}%
                          </Badge>
                          <span className="truncate font-mono">{shortFn(f.fn)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {d.totalCalls24h === 0 && (
                    <div className="text-xs text-muted-foreground">No traffic in the last 24 hours</div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
