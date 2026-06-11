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
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDbQuery } from "@/hooks/use-db";
import { Activity, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface SeriesPoint {
  t: number;
  ttfbMs: number | null;
  ok: boolean;
}

interface ProjectHealth {
  projectSlug: string;
  org: string;
  url: string;
  lastCheckedAt: number;
  lastStatus: number;
  lastOk: boolean;
  lastTtfbMs: number | null;
  lastTotalMs: number | null;
  lastError: string;
  uptimePct: number;
  p50TtfbMs: number | null;
  p95TtfbMs: number | null;
  checkCount: number;
  series: SeriesPoint[];
}

interface Incident {
  projectSlug: string;
  url: string;
  startedAt: number;
  endedAt: number | null;
  failedChecks: number;
  lastStatus: number;
  lastError: string;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(startMs: number, endMs: number | null): string {
  const span = (endMs ?? Date.now()) - startMs;
  const min = Math.round(span / 60000);
  if (min < 1) return "<1m";
  if (min < 60) return `${min}m`;
  return `${(min / 60).toFixed(1)}h`;
}

function ttfbColor(ms: number | null): string {
  if (ms == null) return "";
  if (ms < 400) return "text-green-600 dark:text-green-500";
  if (ms < 1200) return "text-amber-600 dark:text-amber-500";
  return "text-destructive";
}

function Sparkline({ series }: { series: SeriesPoint[] }) {
  const data = series.filter((p) => p.ttfbMs != null).map((p) => ({ v: p.ttfbMs }));
  if (data.length < 2) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="h-7 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <YAxis hide domain={[0, "dataMax"]} />
          <Line type="monotone" dataKey="v" stroke="#3b82f6" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ──────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────

export default function SiteHealthPage() {
  const [days, setDays] = useState("7");
  const [checking, setChecking] = useState(false);

  const params = useMemo(() => ({ days }), [days]);
  const { data, refetch } = useDbQuery<{
    success: boolean;
    projects: ProjectHealth[];
    incidents: Incident[];
  }>("/api/db/site-health", params);

  const sites = useMemo(() => data?.projects ?? [], [data]);
  const incidents = data?.incidents ?? [];

  const upCount = sites.filter((s) => s.lastOk).length;
  const lastChecked = sites.length > 0 ? Math.max(...sites.map((s) => s.lastCheckedAt)) : null;

  const medianAll = useMemo(() => {
    const vals = sites.map((s) => s.p50TtfbMs).filter((v): v is number => v != null).sort((a, b) => a - b);
    return vals.length ? vals[Math.floor(vals.length / 2)] : null;
  }, [sites]);

  async function triggerChecks() {
    setChecking(true);
    try {
      await fetch("/api/db/site-health/run", { method: "POST" });
      refetch();
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last 24 hours</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          {lastChecked && (
            <span className="text-xs text-muted-foreground">Last checked: {formatTime(lastChecked)}</span>
          )}
          <Button size="sm" variant="outline" disabled={checking} onClick={triggerChecks}>
            <RefreshCw className={checking ? "animate-spin" : ""} />
            Run Checks
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Sites Up</CardDescription>
            <CardTitle className={`text-2xl tabular-nums ${upCount < sites.length ? "text-destructive" : ""}`}>
              {upCount}/{sites.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Incidents</CardDescription>
            <CardTitle className={`text-2xl tabular-nums ${incidents.length > 0 ? "text-amber-600 dark:text-amber-500" : ""}`}>
              {incidents.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Median TTFB</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMs(medianAll)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Slowest (p95)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatMs(sites.length ? Math.max(...sites.map((s) => s.p95TtfbMs ?? 0)) : null)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Sites table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Sites</CardTitle>
          <CardDescription className="text-xs">
            Synthetic checks from this machine against each project&rsquo;s production URL
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">TTFB</TableHead>
                <TableHead className="text-right">p50</TableHead>
                <TableHead className="text-right">p95</TableHead>
                <TableHead className="text-right">Uptime</TableHead>
                <TableHead>Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    <Activity className="mx-auto mb-2 size-5 opacity-50" />
                    No checks yet. Hit &ldquo;Run Checks&rdquo; to probe all production URLs.
                  </TableCell>
                </TableRow>
              )}
              {sites.map((s) => (
                <TableRow key={s.projectSlug}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block h-2 w-2 shrink-0 rounded-full ${s.lastOk ? "bg-green-500" : "bg-red-500"}`}
                      />
                      <div className="flex flex-col">
                        <span className="font-medium">{s.projectSlug}</span>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          {s.url.replace(/^https?:\/\//, "")}
                        </a>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {s.lastOk ? (
                      <Badge variant="secondary">{s.lastStatus}</Badge>
                    ) : (
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="destructive">{s.lastStatus || "DOWN"}</Badge>
                        </TooltipTrigger>
                        <TooltipContent>{s.lastError || `HTTP ${s.lastStatus}`}</TooltipContent>
                      </UITooltip>
                    )}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${ttfbColor(s.lastTtfbMs)}`}>
                    {formatMs(s.lastTtfbMs)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatMs(s.p50TtfbMs)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatMs(s.p95TtfbMs)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={s.uptimePct < 99 ? "text-destructive" : ""}>
                      {s.uptimePct.toFixed(s.uptimePct === 100 ? 0 : 1)}%
                    </span>
                  </TableCell>
                  <TableCell>
                    <Sparkline series={s.series} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Incidents */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Incidents</CardTitle>
          <CardDescription className="text-xs">
            Windows of consecutive failed checks in the selected range
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="text-right">Failed Checks</TableHead>
                <TableHead>Last Error</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    No incidents in range 🎉
                  </TableCell>
                </TableRow>
              )}
              {incidents.map((inc, i) => (
                <TableRow key={`${inc.projectSlug}-${inc.startedAt}-${i}`}>
                  <TableCell className="font-medium">{inc.projectSlug}</TableCell>
                  <TableCell className="tabular-nums">{formatTime(inc.startedAt)}</TableCell>
                  <TableCell className="tabular-nums">{formatDuration(inc.startedAt, inc.endedAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inc.failedChecks}</TableCell>
                  <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                    {inc.lastError || `HTTP ${inc.lastStatus}`}
                  </TableCell>
                  <TableCell>
                    {inc.endedAt ? (
                      <Badge variant="secondary">resolved</Badge>
                    ) : (
                      <Badge variant="destructive">ongoing</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
