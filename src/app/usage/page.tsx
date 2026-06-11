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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDbQuery } from "@/hooks/use-db";
import { ChevronDown, RefreshCw, Rocket } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface UsageRow {
  id: number;
  account: string;
  provider: string;
  projectSlug: string;
  date: string;
  metric: string;
  value: number;
  source: string;
}

interface JobRun {
  id: number;
  job: string;
  account: string;
  startedAt: number;
  finishedAt: number | null;
  status: "running" | "success" | "error";
  detail: string;
}

interface ProjectTotals {
  projectSlug: string;
  deploys: number;
  prodDeploys: number;
  errorDeploys: number;
  buildMs: number;
  lastDate: string;
}

const PROJECT_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ef4444",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#f43f5e", "#8b5cf6", "#10b981", "#0ea5e9",
];

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function dateStrDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86400 * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatBuildMinutes(ms: number): string {
  const min = ms / 60000;
  if (min < 1) return "<1m";
  if (min < 60) return `${min.toFixed(1)}m`;
  return `${(min / 60).toFixed(1)}h`;
}

function formatRunTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ──────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────

export default function UsagePage() {
  const [account, setAccount] = useState("minima");
  const [rangeDays, setRangeDays] = useState("30");
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [runsOpen, setRunsOpen] = useState(false);

  const startDate = useMemo(() => dateStrDaysAgo(Number(rangeDays)), [rangeDays]);

  const queryParams = useMemo(
    () => ({ account, provider: "vercel", startDate }),
    [account, startDate]
  );
  const { data: usageRes, refetch } = useDbQuery<{
    success: boolean;
    data: UsageRow[];
    accounts: string[];
  }>("/api/db/usage", queryParams);

  const runsParams = useMemo(() => ({ account }), [account]);
  const { data: runsRes, refetch: refetchRuns } = useDbQuery<{
    success: boolean;
    data: JobRun[];
  }>("/api/db/usage/runs", runsParams);

  const rows = useMemo(() => usageRes?.data ?? [], [usageRes]);
  const accounts = usageRes?.accounts ?? ["minima"];
  const runs = runsRes?.data ?? [];
  const lastRun = runs.find((r) => r.status !== "running");

  // ── Aggregations ──

  const projectTotals = useMemo<ProjectTotals[]>(() => {
    const map = new Map<string, ProjectTotals>();
    for (const r of rows) {
      let t = map.get(r.projectSlug);
      if (!t) {
        t = { projectSlug: r.projectSlug, deploys: 0, prodDeploys: 0, errorDeploys: 0, buildMs: 0, lastDate: "" };
        map.set(r.projectSlug, t);
      }
      if (r.metric === "deploys") {
        t.deploys += r.value;
        if (r.date > t.lastDate) t.lastDate = r.date;
      }
      if (r.metric === "prod_deploys") t.prodDeploys += r.value;
      if (r.metric === "error_deploys") t.errorDeploys += r.value;
      if (r.metric === "build_ms") t.buildMs += r.value;
    }
    return [...map.values()].sort((a, b) => b.buildMs - a.buildMs);
  }, [rows]);

  const totals = useMemo(() => {
    const sum = { deploys: 0, prodDeploys: 0, errorDeploys: 0, buildMs: 0 };
    for (const t of projectTotals) {
      sum.deploys += t.deploys;
      sum.prodDeploys += t.prodDeploys;
      sum.errorDeploys += t.errorDeploys;
      sum.buildMs += t.buildMs;
    }
    return sum;
  }, [projectTotals]);

  const projectColors = useMemo(() => {
    const colors: Record<string, string> = {};
    projectTotals.forEach((t, i) => {
      colors[t.projectSlug] = PROJECT_COLORS[i % PROJECT_COLORS.length];
    });
    return colors;
  }, [projectTotals]);

  // Daily stacked bars: deploys per day, stacked by project (top 10 by build time, rest grouped)
  const { chartData, chartProjects } = useMemo(() => {
    const top = projectTotals.slice(0, 10).map((t) => t.projectSlug);
    const topSet = new Set(top);
    const byDate = new Map<string, Record<string, number>>();
    for (const r of rows) {
      if (r.metric !== "deploys") continue;
      let day = byDate.get(r.date);
      if (!day) {
        day = {};
        byDate.set(r.date, day);
      }
      const key = topSet.has(r.projectSlug) ? r.projectSlug : "other";
      day[key] = (day[key] ?? 0) + r.value;
    }
    const dates = [...byDate.keys()].sort();
    const data = dates.map((date) => ({
      date: date.slice(5), // MM-DD
      ...byDate.get(date),
    }));
    const hasOther = data.some((d) => "other" in d);
    return { chartData: data, chartProjects: hasOther ? [...top, "other"] : top };
  }, [rows, projectTotals]);

  // ── Actions ──

  async function triggerIngest(days?: number) {
    setIngesting(true);
    setIngestError(null);
    try {
      const res = await fetch("/api/db/usage/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, days }),
      });
      const json = await res.json();
      if (!json.success) setIngestError(json.error || "Ingest failed");
      refetch();
      refetchRuns();
    } catch (e) {
      setIngestError(String(e));
    } finally {
      setIngesting(false);
    }
  }

  const errorRate = totals.deploys > 0 ? (totals.errorDeploys / totals.deploys) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={account} onValueChange={setAccount}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={rangeDays} onValueChange={setRangeDays}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          {lastRun && (
            <span className="text-xs text-muted-foreground">
              Last sync: {formatRunTime(lastRun.startedAt)}
              {lastRun.status === "error" && (
                <Badge variant="destructive" className="ml-1.5">failed</Badge>
              )}
            </span>
          )}
          <Button size="sm" variant="outline" disabled={ingesting} onClick={() => triggerIngest()}>
            <RefreshCw className={ingesting ? "animate-spin" : ""} />
            Run Ingest
          </Button>
          <Button size="sm" variant="ghost" disabled={ingesting} onClick={() => triggerIngest(90)}>
            Backfill 90d
          </Button>
        </div>
      </div>

      {ingestError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ingestError}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Deploys</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{totals.deploys}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Production</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{totals.prodDeploys}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Build Time</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatBuildMinutes(totals.buildMs)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Error Rate</CardDescription>
            <CardTitle className={`text-2xl tabular-nums ${errorRate > 20 ? "text-destructive" : ""}`}>
              {errorRate.toFixed(1)}%
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Active Projects</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{projectTotals.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Daily chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Deploys Per Day</CardTitle>
          <CardDescription className="text-xs">Stacked by project</CardDescription>
        </CardHeader>
        <CardContent className="pb-4">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                labelStyle={{ fontWeight: 600 }}
              />
              {chartProjects.map((slug, i) => (
                <Bar
                  key={slug}
                  dataKey={slug}
                  stackId="a"
                  fill={slug === "other" ? "#94a3b8" : projectColors[slug]}
                  radius={i === chartProjects.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
            {chartProjects.map((slug) => (
              <span key={slug} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: slug === "other" ? "#94a3b8" : projectColors[slug] }}
                />
                {slug}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Per-project table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Projects</CardTitle>
          <CardDescription className="text-xs">Sorted by build time consumed</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Deploys</TableHead>
                <TableHead className="text-right">Prod</TableHead>
                <TableHead className="text-right">Errors</TableHead>
                <TableHead className="text-right">Build Time</TableHead>
                <TableHead className="text-right">Last Deploy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectTotals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    <Rocket className="mx-auto mb-2 size-5 opacity-50" />
                    No usage data yet. Hit &ldquo;Run Ingest&rdquo; to pull from Vercel.
                  </TableCell>
                </TableRow>
              )}
              {projectTotals.map((t) => {
                const errPct = t.deploys > 0 ? (t.errorDeploys / t.deploys) * 100 : 0;
                return (
                  <TableRow key={t.projectSlug}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ background: projectColors[t.projectSlug] }}
                        />
                        {t.projectSlug}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{t.deploys}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.prodDeploys}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.errorDeploys > 0 ? (
                        <span className={errPct > 30 ? "font-medium text-destructive" : ""}>
                          {t.errorDeploys}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatBuildMinutes(t.buildMs)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{t.lastDate}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Ingest run log */}
      <Collapsible open={runsOpen} onOpenChange={setRunsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer pb-2 select-none">
              <CardTitle className="flex items-center justify-between text-sm font-medium">
                Ingest Log
                <ChevronDown className={`size-4 transition-transform ${runsOpen ? "rotate-180" : ""}`} />
              </CardTitle>
              <CardDescription className="text-xs">
                {runs.length} recent run{runs.length === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                        No runs yet
                      </TableCell>
                    </TableRow>
                  )}
                  {runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="tabular-nums">{formatRunTime(r.startedAt)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.status === "success" ? "secondary" : r.status === "error" ? "destructive" : "outline"
                          }
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.finishedAt ? `${((r.finishedAt - r.startedAt) / 1000).toFixed(1)}s` : "—"}
                      </TableCell>
                      <TableCell className="max-w-[400px] truncate text-xs text-muted-foreground">
                        {r.detail}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
