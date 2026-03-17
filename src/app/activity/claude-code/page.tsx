"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useDbQuery } from "@/hooks/use-db";
import { useActivityFilters, getDateRange } from "@/hooks/use-activity-filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface CCUsageRow {
  id: number;
  projectId: string;
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  userMessageCount: number;
  assistantMessageCount: number;
  sessionCount: number;
  totalClaudeMinutes: number;
}

interface ProjectInfo {
  id: string;
  projectName: string;
  repoName: string;
  org: string;
  port: number;
}

interface ProjectConfig {
  color?: string;
  favicon?: string;
}

// ──────────────────────────────────────────────
// Constants / helpers
// ──────────────────────────────────────────────

const FALLBACK_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ef4444",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#f43f5e", "#8b5cf6", "#10b981", "#0ea5e9",
];

const TOKEN_TYPE_COLORS: Record<string, string> = {
  Input: "#3b82f6",
  Output: "#22c55e",
  "Cache Created": "#f59e0b",
  "Cache Read": "#94a3b8",
};

const DATE_LABELS: Record<string, string> = {
  today: "1D", week: "7D", month: "30D", all: "All",
};

function hslToHex(hsl: string): string | null {
  const m = hsl.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/);
  if (!m) return hsl.startsWith("#") ? hsl : null;
  const h = parseFloat(m[1]) / 360, s = parseFloat(m[2]) / 100, l = parseFloat(m[3]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function resolveColor(config: ProjectConfig | undefined, fallback: string): string {
  if (config?.color) return hslToHex(config.color) || fallback;
  return fallback;
}

function faviconUrl(config: ProjectConfig | undefined): string | null {
  if (!config?.favicon) return null;
  return `/api/favicon?path=${encodeURIComponent(config.favicon)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatHours(minutes: number): string {
  const h = minutes / 60;
  if (h >= 10) return `${h.toFixed(1)}h`;
  if (h >= 1) return `${h.toFixed(2)}h`;
  return `${minutes.toFixed(0)}m`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ──────────────────────────────────────────────
// Project combobox
// ──────────────────────────────────────────────

function ProjectCombobox({
  value, onChange, projects,
}: {
  value: string; onChange: (v: string) => void; projects: ProjectInfo[];
}) {
  const [open, setOpen] = useState(false);
  const label = value === "all"
    ? "All Projects"
    : projects.find((p) => p.id === value)?.projectName || "All Projects";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open}
          className="w-[170px] h-7 text-xs justify-between font-normal">
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search projects..." className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty>No project found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="all" onSelect={() => { onChange("all"); setOpen(false); }}>
                <Check className={cn("mr-2 h-3 w-3", value === "all" ? "opacity-100" : "opacity-0")} />
                All Projects
              </CommandItem>
              {projects.map((p) => (
                <CommandItem key={p.id} value={p.projectName}
                  onSelect={() => { onChange(p.id); setOpen(false); }}>
                  <Check className={cn("mr-2 h-3 w-3", value === p.id ? "opacity-100" : "opacity-0")} />
                  {p.projectName}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ──────────────────────────────────────────────
// Stat card
// ──────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────
// Custom chart legend with favicons
// ──────────────────────────────────────────────

function ProjectLegend({
  items,
  configs,
}: {
  items: { id: string; name: string; color: string }[];
  configs: Record<string, ProjectConfig>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 justify-center">
      {items.map(({ id, name, color }) => {
        const fav = faviconUrl(configs[id]);
        return (
          <span key={id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {fav ? (
              <Image src={fav} alt="" width={12} height={12} className="shrink-0 rounded-sm" unoptimized />
            ) : (
              <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: color }} />
            )}
            {name}
          </span>
        );
      })}
    </div>
  );
}


// ──────────────────────────────────────────────
// Custom tooltips
// ──────────────────────────────────────────────

function BarTooltip({ active, payload, label, formatter, activeKey }: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: ReadonlyArray<any>;
  label?: string | number;
  formatter: (n: number) => string;
  activeKey?: string | null;
}) {
  if (!active || !payload?.length) return null;

  if (activeKey) {
    // Show only the hovered segment
    const item = payload.find((p) => p.dataKey === activeKey);
    if (!item || !item.value) return null;
    const all = [...payload].filter((p) => p.value > 0);
    const total = all.reduce((s, p) => s + p.value, 0);
    const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : null;
    return (
      <div className="rounded-lg border bg-background p-2.5 shadow-md text-xs min-w-[120px]">
        <p className="text-muted-foreground mb-1">{label}</p>
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="inline-block h-2 w-2 rounded-sm shrink-0" style={{ background: item.color }} />
          <span className="font-medium truncate max-w-[140px]">{item.name}</span>
        </div>
        <p className="font-mono font-semibold text-sm">{formatter(item.value)}</p>
        {pct && <p className="text-muted-foreground">{pct}% of total</p>}
      </div>
    );
  }

  // Fallback: no active key (shouldn't normally show in the multi-bar case)
  const visible = [...payload].filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  const total = visible.reduce((s, p) => s + p.value, 0);
  return (
    <div className="rounded-lg border bg-background p-2.5 shadow-md text-xs space-y-1 min-w-[140px]">
      <p className="font-medium mb-1.5">{label}</p>
      {visible.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm shrink-0" style={{ background: p.color }} />
            <span className="text-muted-foreground truncate max-w-[120px]">{p.name}</span>
          </span>
          <span className="font-mono font-medium">{formatter(p.value)}</span>
        </div>
      ))}
      {visible.length > 1 && (
        <div className="flex justify-between pt-1 border-t mt-1">
          <span className="text-muted-foreground">Total</span>
          <span className="font-mono font-medium">{formatter(total)}</span>
        </div>
      )}
    </div>
  );
}

function PieTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { pct: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border bg-background p-2.5 shadow-md text-xs">
      <p className="font-medium">{p.name}</p>
      <p className="font-mono mt-0.5">{formatTokens(p.value)}</p>
      <p className="text-muted-foreground">{(p.payload.pct * 100).toFixed(1)}%</p>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────

export default function ClaudeCodePage() {
  const { dateRange, setDateRange, projectId, setProjectId, org, setOrg } = useActivityFilters();
  const range = getDateRange(dateRange);

  const ccParams: Record<string, string> = {};
  if (range) { ccParams.startDate = range.startDate; ccParams.endDate = range.endDate; }
  if (projectId !== "all") ccParams.projectId = projectId;

  const { data: ccData, loading: ccLoading } = useDbQuery<{ success: boolean; data: CCUsageRow[] }>(
    "/api/db/cc-usage", ccParams
  );
  const { data: projectsData } = useDbQuery<{ success: boolean; projects: ProjectInfo[] }>(
    "/api/db/projects"
  );
  const { data: configsData } = useDbQuery<{ success: boolean; configs: Record<string, ProjectConfig> }>(
    "/api/project-configs"
  );

  const allProjects = projectsData?.projects || [];
  const configs = configsData?.configs || {};
  const rawRows = ccData?.data || [];

  // Client-side org filter
  const projectIdsByOrg = useMemo(() => {
    if (org === "all") return null;
    return new Set(allProjects.filter((p) => p.org === org).map((p) => p.id));
  }, [allProjects, org]);

  const rows = useMemo(() => {
    if (!projectIdsByOrg) return rawRows;
    return rawRows.filter((r) => projectIdsByOrg.has(r.projectId));
  }, [rawRows, projectIdsByOrg]);

  // Projects that appear in the data
  const projectsInData = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (!seen.has(r.projectId)) {
        const p = allProjects.find((p) => p.id === r.projectId);
        seen.set(r.projectId, p?.projectName || r.projectId.slice(0, 8));
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [rows, allProjects]);

  // Color per project: from config first, then fallback palette
  const projectColors = useMemo(() => {
    const map: Record<string, string> = {};
    projectsInData.forEach(({ id }, i) => {
      map[id] = resolveColor(configs[id], FALLBACK_COLORS[i % FALLBACK_COLORS.length]);
    });
    return map;
  }, [projectsInData, configs]);

  const orgs = useMemo(() => {
    const set = new Set<string>();
    for (const p of allProjects) if (p.org) set.add(p.org);
    return [...set].sort();
  }, [allProjects]);

  const filteredProjects = useMemo(() =>
    org === "all" ? allProjects : allProjects.filter((p) => p.org === org),
    [allProjects, org]
  );

  // ── Summary totals ──
  const totals = useMemo(() => {
    let inputTokens = 0, outputTokens = 0, cacheCreate = 0, cacheRead = 0, sessions = 0, claudeMinutes = 0;
    for (const r of rows) {
      inputTokens += r.inputTokens; outputTokens += r.outputTokens;
      cacheCreate += r.cacheCreationTokens; cacheRead += r.cacheReadTokens;
      sessions += r.sessionCount; claudeMinutes += r.totalClaudeMinutes;
    }
    return { inputTokens, outputTokens, cacheCreate, cacheRead, sessions, claudeMinutes };
  }, [rows]);

  // ── All dates ──
  const allDates = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(r.date);
    return [...s].sort();
  }, [rows]);

  // ── Token bar chart data ──
  const tokenBarData = useMemo(() => {
    if (projectId !== "all") {
      const byDate: Record<string, Record<string, number>> = {};
      for (const r of rows) {
        byDate[r.date] = {
          Input: r.inputTokens, Output: r.outputTokens,
          "Cache Created": r.cacheCreationTokens, "Cache Read": r.cacheReadTokens,
        };
      }
      return allDates.map((d) => ({
        date: formatDate(d),
        ...(byDate[d] || { Input: 0, Output: 0, "Cache Created": 0, "Cache Read": 0 }),
      }));
    }
    const byDate: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      if (!byDate[r.date]) byDate[r.date] = {};
      byDate[r.date][r.projectId] = (byDate[r.date][r.projectId] || 0) + r.inputTokens + r.outputTokens;
    }
    return allDates.map((d) => {
      const entry: Record<string, number | string> = { date: formatDate(d) };
      for (const { id } of projectsInData) entry[id] = byDate[d]?.[id] || 0;
      return entry;
    });
  }, [rows, allDates, projectId, projectsInData]);

  // ── Duration stacked bar data ──
  const durationBarData = useMemo(() => {
    if (projectId !== "all") {
      const byDate: Record<string, number> = {};
      for (const r of rows) byDate[r.date] = (byDate[r.date] || 0) + r.totalClaudeMinutes;
      return allDates.map((d) => ({ date: formatDate(d), minutes: byDate[d] || 0 }));
    }
    const byDate: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      if (!byDate[r.date]) byDate[r.date] = {};
      byDate[r.date][r.projectId] = (byDate[r.date][r.projectId] || 0) + r.totalClaudeMinutes;
    }
    return allDates.map((d) => {
      const entry: Record<string, number | string> = { date: formatDate(d) };
      for (const { id } of projectsInData) entry[id] = byDate[d]?.[id] || 0;
      return entry;
    });
  }, [rows, allDates, projectId, projectsInData]);

  // Per-project token totals for sorting bars (highest at bottom = renders first)
  const projectTokenTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) map[r.projectId] = (map[r.projectId] || 0) + r.inputTokens + r.outputTokens;
    return map;
  }, [rows]);

  // Projects sorted highest→lowest by total tokens (bottom of stack first)
  const projectsSorted = useMemo(() =>
    [...projectsInData].sort((a, b) => (projectTokenTotals[b.id] || 0) - (projectTokenTotals[a.id] || 0)),
    [projectsInData, projectTokenTotals]
  );

  // Legend items use sorted order (matches bar stack order)
  const legendItems = useMemo(() =>
    projectsSorted.map(({ id, name }) => ({ id, name, color: projectColors[id] })),
    [projectsSorted, projectColors]
  );

  // ── Token pie chart data (with pct pre-computed to avoid recharts NaN) ──
  const pieData = useMemo(() => {
    let items: { name: string; value: number; id?: string }[];
    if (projectId !== "all") {
      items = [
        { name: "Input", value: totals.inputTokens },
        { name: "Output", value: totals.outputTokens },
        { name: "Cache Created", value: totals.cacheCreate },
        { name: "Cache Read", value: totals.cacheRead },
      ].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
    } else {
      items = projectsSorted.map(({ id, name }) => {
        const value = rows.filter((r) => r.projectId === id)
          .reduce((s, r) => s + r.inputTokens + r.outputTokens, 0);
        return { id, name, value };
      }).filter((d) => d.value > 0);
    }
    const total = items.reduce((s, d) => s + d.value, 0);
    return items.map((d) => ({ ...d, pct: total > 0 ? d.value / total : 0 }));
  }, [rows, projectId, projectsSorted, totals]);

  // ── Duration pie chart data (with pct pre-computed) ──
  const durationPieData = useMemo(() => {
    if (projectId !== "all") return [];
    const items = projectsSorted.map(({ id, name }) => {
      const value = rows.filter((r) => r.projectId === id)
        .reduce((s, r) => s + r.totalClaudeMinutes, 0);
      return { id, name, value };
    }).filter((d) => d.value > 0);
    const total = items.reduce((s, d) => s + d.value, 0);
    return items.map((d) => ({ ...d, pct: total > 0 ? d.value / total : 0 }));
  }, [rows, projectId, projectsSorted]);

  // Token types sorted by period total, highest at bottom
  const sortedTokenTypes = useMemo(() => [
    { name: "Input", value: totals.inputTokens, color: TOKEN_TYPE_COLORS["Input"] },
    { name: "Output", value: totals.outputTokens, color: TOKEN_TYPE_COLORS["Output"] },
    { name: "Cache Created", value: totals.cacheCreate, color: TOKEN_TYPE_COLORS["Cache Created"] },
    { name: "Cache Read", value: totals.cacheRead, color: TOKEN_TYPE_COLORS["Cache Read"] },
  ].sort((a, b) => b.value - a.value), [totals]);

  // ── Project ranking ──
  const projectRankings = useMemo(() => {
    const byProject: Record<string, {
      name: string; inputTokens: number; outputTokens: number;
      cacheCreate: number; cacheRead: number; sessions: number; claudeMinutes: number;
    }> = {};
    for (const r of rows) {
      if (!byProject[r.projectId]) {
        const p = allProjects.find((p) => p.id === r.projectId);
        byProject[r.projectId] = { name: p?.projectName || r.projectId.slice(0, 8), inputTokens: 0, outputTokens: 0, cacheCreate: 0, cacheRead: 0, sessions: 0, claudeMinutes: 0 };
      }
      const a = byProject[r.projectId];
      a.inputTokens += r.inputTokens; a.outputTokens += r.outputTokens;
      a.cacheCreate += r.cacheCreationTokens; a.cacheRead += r.cacheReadTokens;
      a.sessions += r.sessionCount; a.claudeMinutes += r.totalClaudeMinutes;
    }
    return Object.entries(byProject)
      .map(([id, v]) => ({ id, ...v, totalTokens: v.inputTokens + v.outputTokens }))
      .sort((a, b) => b.totalTokens - a.totalTokens);
  }, [rows, allProjects]);

  // Table totals row
  const tableTotal = useMemo(() => projectRankings.reduce((acc, p) => ({
    inputTokens: acc.inputTokens + p.inputTokens,
    outputTokens: acc.outputTokens + p.outputTokens,
    cacheCreate: acc.cacheCreate + p.cacheCreate,
    cacheRead: acc.cacheRead + p.cacheRead,
    sessions: acc.sessions + p.sessions,
    claudeMinutes: acc.claudeMinutes + p.claudeMinutes,
  }), { inputTokens: 0, outputTokens: 0, cacheCreate: 0, cacheRead: 0, sessions: 0, claudeMinutes: 0 }),
  [projectRankings]);

  const [activeTokenKey, setActiveTokenKey] = useState<string | null>(null);
  const [activeDurationKey, setActiveDurationKey] = useState<string | null>(null);

  const tickInterval = allDates.length > 14 ? Math.floor(allDates.length / 10) : 0;
  const isEmpty = !ccLoading && rows.length === 0;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-0.5">
          {(["today", "week", "month", "all"] as const).map((r) => (
            <Button key={r} variant={dateRange === r ? "default" : "ghost"} size="sm"
              className="h-7 px-2 text-xs" onClick={() => setDateRange(r)}>
              {DATE_LABELS[r]}
            </Button>
          ))}
        </div>
        <Select value={org} onValueChange={setOrg}>
          <SelectTrigger className="w-[140px] h-7 text-xs"><SelectValue placeholder="All Orgs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orgs</SelectItem>
            {orgs.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <ProjectCombobox value={projectId} onChange={setProjectId} projects={filteredProjects} />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Input + Output Tokens"
          value={formatTokens(totals.inputTokens + totals.outputTokens)}
          sub={`${formatTokens(totals.inputTokens)} in · ${formatTokens(totals.outputTokens)} out`}
        />
        <StatCard
          label="Cache Tokens"
          value={formatTokens(totals.cacheCreate + totals.cacheRead)}
          sub={`${formatTokens(totals.cacheCreate)} created · ${formatTokens(totals.cacheRead)} read`}
        />
        <StatCard
          label="Claude Hours"
          value={formatHours(totals.claudeMinutes)}
          sub={`${totals.claudeMinutes.toFixed(0)} minutes`}
        />
        <StatCard
          label="Sessions"
          value={totals.sessions.toLocaleString()}
          sub={`across ${projectRankings.length} project${projectRankings.length !== 1 ? "s" : ""}`}
        />
      </div>

      {isEmpty ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No Claude Code usage data for this period.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Token usage: stacked bar + donut pie side by side */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px] lg:items-stretch">
            {/* Stacked bar */}
            <Card className="flex flex-col">
              <CardHeader className="pb-2 shrink-0">
                <CardTitle className="text-sm font-medium">Token Usage Over Time</CardTitle>
                <CardDescription className="text-xs">
                  {projectId !== "all"
                    ? "Stacked by token type per day"
                    : "Input + output tokens per day, stacked by project"}
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-4 flex flex-col flex-1 min-h-0">
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tokenBarData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={tickInterval} />
                      <YAxis tickFormatter={formatTokens} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                      <Tooltip content={(props) => <BarTooltip {...props} formatter={formatTokens} activeKey={activeTokenKey} />} />
                      {projectId !== "all"
                        ? sortedTokenTypes.map(({ name, color }, i, arr) => (
                            <Bar key={name} dataKey={name} stackId="a" fill={color}
                              radius={i === arr.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                              onMouseEnter={() => setActiveTokenKey(name)}
                              onMouseLeave={() => setActiveTokenKey(null)} />
                          ))
                        : projectsSorted.map(({ id, name }, i) => (
                            <Bar key={id} dataKey={id} name={name} stackId="a" fill={projectColors[id]}
                              radius={i === projectsSorted.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                              onMouseEnter={() => setActiveTokenKey(id)}
                              onMouseLeave={() => setActiveTokenKey(null)} />
                          ))
                      }
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {projectId === "all"
                  ? <ProjectLegend items={legendItems} configs={configs} />
                  : (
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 justify-center shrink-0">
                      {sortedTokenTypes.map(({ name, color }) => (
                        <span key={name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: color }} />
                          {name}
                        </span>
                      ))}
                    </div>
                  )
                }
              </CardContent>
            </Card>

            {/* Donut pie */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Token Share</CardTitle>
                <CardDescription className="text-xs">
                  {projectId !== "all" ? "By token type for period" : "By project for period"}
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-4">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius="52%"
                      outerRadius="78%"
                      paddingAngle={2}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {pieData.map((entry, i) => {
                        const color = projectId !== "all"
                          ? TOKEN_TYPE_COLORS[entry.name] || FALLBACK_COLORS[i]
                          : projectColors[(entry as { id?: string }).id || ""] || FALLBACK_COLORS[i];
                        return <Cell key={entry.name} fill={color} />;
                      })}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Pie legend */}
                <div className="flex flex-col gap-1.5 mt-1">
                  {pieData.map((entry, i) => {
                    const isProject = projectId === "all";
                    const id = (entry as { id?: string }).id;
                    const color = isProject
                      ? projectColors[id || ""] || FALLBACK_COLORS[i]
                      : TOKEN_TYPE_COLORS[entry.name] || FALLBACK_COLORS[i];
                    const fav = isProject && id ? faviconUrl(configs[id]) : null;
                    return (
                      <div key={entry.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          {fav ? (
                            <Image src={fav} alt="" width={12} height={12} className="shrink-0 rounded-sm" unoptimized />
                          ) : (
                            <span className="inline-block h-2 w-2 rounded-sm shrink-0" style={{ background: color }} />
                          )}
                          <span className="truncate max-w-[140px]">{entry.name}</span>
                        </span>
                        <span className="font-mono text-muted-foreground">{(entry.pct * 100).toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Claude working time — stacked bar + pie */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px] lg:items-stretch">
            <Card className="flex flex-col">
              <CardHeader className="pb-2 shrink-0">
                <CardTitle className="text-sm font-medium">Claude Working Time</CardTitle>
                <CardDescription className="text-xs">
                  {projectId !== "all"
                    ? "Minutes Claude worked per day"
                    : "Claude working time per day, stacked by project"}
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-4 flex flex-col flex-1 min-h-0">
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={durationBarData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={tickInterval} />
                      <YAxis tickFormatter={(v) => formatHours(v)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                      <Tooltip content={(props) => <BarTooltip {...props} formatter={formatHours} activeKey={activeDurationKey} />} />
                      {projectId !== "all"
                        ? (
                            <Bar dataKey="minutes" name="Claude Time" fill={FALLBACK_COLORS[0]}
                              radius={[2, 2, 0, 0]}
                              onMouseEnter={() => setActiveDurationKey("minutes")}
                              onMouseLeave={() => setActiveDurationKey(null)} />
                          )
                        : projectsSorted.map(({ id, name }, i) => (
                            <Bar key={id} dataKey={id} name={name} stackId="a" fill={projectColors[id]}
                              radius={i === projectsSorted.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                              onMouseEnter={() => setActiveDurationKey(id)}
                              onMouseLeave={() => setActiveDurationKey(null)} />
                          ))
                      }
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {projectId === "all" && <ProjectLegend items={legendItems} configs={configs} />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Time Share</CardTitle>
                <CardDescription className="text-xs">
                  {projectId !== "all" ? "All Claude time for this project" : "By project for period"}
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-4">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={projectId !== "all" ? durationPieData : durationPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius="52%"
                      outerRadius="78%"
                      paddingAngle={2}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {durationPieData.map((entry, i) => {
                        const color = projectColors[(entry as { id?: string }).id || ""] || FALLBACK_COLORS[i];
                        return <Cell key={entry.name} fill={color} />;
                      })}
                    </Pie>
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0];
                      const pct = (p.payload as { pct: number }).pct;
                      return (
                        <div className="rounded-lg border bg-background p-2.5 shadow-md text-xs">
                          <p className="font-medium">{p.name}</p>
                          <p className="font-mono mt-0.5">{formatHours(p.value as number)}</p>
                          <p className="text-muted-foreground">{(pct * 100).toFixed(1)}%</p>
                        </div>
                      );
                    }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1.5 mt-1">
                  {durationPieData.map((entry, i) => {
                    const id = (entry as { id?: string }).id;
                    const color = projectColors[id || ""] || FALLBACK_COLORS[i];
                    const fav = id ? faviconUrl(configs[id]) : null;
                    return (
                      <div key={entry.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          {fav ? (
                            <Image src={fav} alt="" width={12} height={12} className="shrink-0 rounded-sm" unoptimized />
                          ) : (
                            <span className="inline-block h-2 w-2 rounded-sm shrink-0" style={{ background: color }} />
                          )}
                          <span className="truncate max-w-[140px]">{entry.name}</span>
                        </span>
                        <span className="font-mono text-muted-foreground">{(entry.pct * 100).toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Project breakdown table */}
          {projectRankings.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Project Breakdown</CardTitle>
                <CardDescription className="text-xs">Sorted by input + output tokens</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left font-medium text-muted-foreground py-2 pl-6 pr-3">Project</th>
                      <th className="text-right font-medium text-muted-foreground py-2 px-3">Input</th>
                      <th className="text-right font-medium text-muted-foreground py-2 px-3">Output</th>
                      <th className="text-right font-medium text-muted-foreground py-2 px-3">Cache Created</th>
                      <th className="text-right font-medium text-muted-foreground py-2 px-3">Cache Read</th>
                      <th className="text-right font-medium text-muted-foreground py-2 px-3">Sessions</th>
                      <th className="text-right font-medium text-muted-foreground py-2 pl-3 pr-6">Claude Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectRankings.map((p) => {
                      const color = projectColors[p.id] || "#6b7280";
                      const fav = faviconUrl(configs[p.id]);
                      return (
                        <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                          <td className="py-2 pl-6 pr-3">
                            <span className="flex items-center gap-2">
                              {fav ? (
                                <Image src={fav} alt="" width={14} height={14}
                                  className="shrink-0 rounded-sm" unoptimized />
                              ) : (
                                <span className="inline-block h-2 w-2 rounded-full shrink-0"
                                  style={{ background: color }} />
                              )}
                              <span className="font-medium">{p.name}</span>
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono">{formatTokens(p.inputTokens)}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatTokens(p.outputTokens)}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatTokens(p.cacheCreate)}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatTokens(p.cacheRead)}</td>
                          <td className="py-2 px-3 text-right font-mono">{p.sessions}</td>
                          <td className="py-2 pl-3 pr-6 text-right font-mono">{formatHours(p.claudeMinutes)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30">
                      <td className="py-2 pl-6 pr-3 font-medium text-muted-foreground">Total</td>
                      <td className="py-2 px-3 text-right font-mono font-medium">{formatTokens(tableTotal.inputTokens)}</td>
                      <td className="py-2 px-3 text-right font-mono font-medium">{formatTokens(tableTotal.outputTokens)}</td>
                      <td className="py-2 px-3 text-right font-mono font-medium">{formatTokens(tableTotal.cacheCreate)}</td>
                      <td className="py-2 px-3 text-right font-mono font-medium">{formatTokens(tableTotal.cacheRead)}</td>
                      <td className="py-2 px-3 text-right font-mono font-medium">{tableTotal.sessions}</td>
                      <td className="py-2 pl-3 pr-6 text-right font-mono font-medium">{formatHours(tableTotal.claudeMinutes)}</td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
