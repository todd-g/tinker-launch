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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { useActivityFilters, getDateRange } from "@/hooks/use-activity-filters";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Monitor,
  Terminal,
  List,
} from "lucide-react";
import { useState, useMemo, useEffect, Fragment } from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface ProjectConfig {
  color?: string;
  favicon?: string;
}

interface SnapshotRow {
  id: number;
  timestamp: number;
  app: string;
  windowTitle: string;
  bundleId: string;
  projectId: string | null;
  projectName: string | null;
  activityType: string;
  url: string;
  source: string;
  durationSeconds: number;
  org: string;
  chromeProfile: string;
  browserCategory: string;
  slackWorkspace: string;
  slackChannel: string;
  slackChannelType: string;
  ccSessionId: string;
  ccUserChars: number;
}

interface ProjectInfo {
  id: string;
  projectName: string;
  repoName: string;
  org: string;
  port: number;
  localPath: string;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function hslToHex(hsl: string): string | null {
  const m = hsl.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/);
  if (!m) return hsl.startsWith("#") ? hsl : null;
  const h = parseFloat(m[1]) / 360;
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const ACTIVITY_COLORS: Record<string, string> = {
  coding: "#3b82f6",
  browser_local: "#22c55e",
  browser_staging: "#f59e0b",
  browser_prod: "#a855f7",
  xcode: "#06b6d4",
  slack: "#e11d48",
  cc_turn: "#8b5cf6",
  other: "#6b7280",
};

const ACTIVITY_BG_CLASSES: Record<string, string> = {
  coding: "bg-blue-500",
  browser_local: "bg-green-500",
  browser_staging: "bg-amber-500",
  browser_prod: "bg-purple-500",
  xcode: "bg-cyan-500",
  slack: "bg-rose-500",
  cc_turn: "bg-violet-500",
  other: "bg-gray-500",
};

const ACTIVITY_LABELS: Record<string, string> = {
  coding: "Coding",
  browser_local: "Browser (Local)",
  browser_staging: "Browser (Staging)",
  browser_prod: "Browser (Prod)",
  xcode: "Xcode",
  slack: "Slack",
  cc_turn: "CC Turn",
  other: "Other",
};

// ──────────────────────────────────────────────
// Project badge
// ──────────────────────────────────────────────

function ProjectBadge({
  projectId,
  projectName,
  configs,
  size = "default",
}: {
  projectId: string;
  projectName: string;
  configs: Record<string, ProjectConfig>;
  size?: "default" | "sm";
}) {
  const config = configs[projectId];
  const hex = config?.color ? hslToHex(config.color) || config.color : null;
  const faviconSrc = config?.favicon
    ? `/api/favicon?path=${encodeURIComponent(config.favicon)}`
    : null;

  return (
    <span className={`inline-flex items-center gap-1.5 ${size === "sm" ? "text-xs" : "text-sm"}`}>
      {hex && (
        <span
          className={`inline-block rounded-full shrink-0 ${size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5"}`}
          style={{ backgroundColor: hex }}
        />
      )}
      {faviconSrc && (
        <Image
          src={faviconSrc}
          alt=""
          width={size === "sm" ? 12 : 16}
          height={size === "sm" ? 12 : 16}
          className="shrink-0"
          unoptimized
        />
      )}
      <span className="font-medium">{projectName}</span>
    </span>
  );
}

// ──────────────────────────────────────────────
// Meta Row helper
// ──────────────────────────────────────────────

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <span className="text-muted-foreground w-32 shrink-0">{label}</span>
      <span className={`${mono ? "font-mono" : ""} break-all`}>{value}</span>
    </div>
  );
}

// ──────────────────────────────────────────────
// Searchable project combobox
// ──────────────────────────────────────────────

function ProjectCombobox({
  value,
  onChange,
  projects,
}: {
  value: string;
  onChange: (value: string) => void;
  projects: ProjectInfo[];
}) {
  const [open, setOpen] = useState(false);
  const selectedName = value === "all"
    ? "All Projects"
    : projects.find((p) => p.id === value)?.projectName || "All Projects";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[170px] h-7 text-xs justify-between font-normal"
        >
          <span className="truncate">{selectedName}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search projects..." className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty>No project found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="all"
                onSelect={() => { onChange("all"); setOpen(false); }}
              >
                <Check className={cn("mr-2 h-3 w-3", value === "all" ? "opacity-100" : "opacity-0")} />
                All Projects
              </CommandItem>
              {projects.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.projectName}
                  onSelect={() => { onChange(p.id); setOpen(false); }}
                >
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
// Main Page — Activity Log
// ──────────────────────────────────────────────

export default function ActivityPage() {
  const { dateRange, setDateRange, projectId, setProjectId, org, setOrg, queryParams } = useActivityFilters();

  // Timeline-specific filters
  const [sourceFilter, setSourceFilter] = useState("all");
  const [activityTypeFilter, setActivityTypeFilter] = useState("all");
  const [unassigned, setUnassigned] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const range = getDateRange(dateRange);

  // Projects & configs for badges
  const { data: projectsData } = useDbQuery<{
    success: boolean;
    projects: ProjectInfo[];
  }>("/api/db/projects");
  const projects = projectsData?.projects || [];

  const { data: configsData } = useDbQuery<{
    success: boolean;
    configs: Record<string, ProjectConfig>;
  }>("/api/project-configs");
  const configs = configsData?.configs || {};

  const projectNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projects) map[p.id] = p.projectName;
    return map;
  }, [projects]);

  // Derive unique orgs from projects
  const orgs = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) {
      if (p.org) set.add(p.org);
    }
    return [...set].sort();
  }, [projects]);

  // Filter projects by selected org
  const filteredProjects = useMemo(() => {
    if (org === "all") return projects;
    return projects.filter((p) => p.org === org);
  }, [projects, org]);

  // Main data query
  const params: Record<string, string> = {
    limit: String(pageSize),
    offset: String(page * pageSize),
  };
  if (range) {
    params.startDate = range.startDate;
    params.endDate = range.endDate;
  }
  if (projectId !== "all") params.projectId = projectId;
  if (org !== "all") params.org = org;
  if (sourceFilter !== "all") params.source = sourceFilter;
  if (activityTypeFilter !== "all") params.activityType = activityTypeFilter;
  if (unassigned) params.unassigned = "1";

  const { data, loading } = useDbQuery<{ success: boolean; data: SnapshotRow[]; total: number }>(
    "/api/db/activity-snapshots",
    params
  );
  const snapshots = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [dateRange, projectId, org, sourceFilter, activityTypeFilter, unassigned]);

  const DATE_LABELS: Record<string, string> = { today: "1D", week: "7D", month: "30D", all: "All" };

  return (
    <div className="space-y-4">
      {/* All filters on one line */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-0.5">
          {(["today", "week", "month", "all"] as const).map((r) => (
            <Button
              key={r}
              variant={dateRange === r ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setDateRange(r)}
            >
              {DATE_LABELS[r]}
            </Button>
          ))}
        </div>

        <Select value={org} onValueChange={setOrg}>
          <SelectTrigger className="w-[140px] h-7 text-xs">
            <SelectValue placeholder="All Orgs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orgs</SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ProjectCombobox
          value={projectId}
          onChange={setProjectId}
          projects={filteredProjects}
        />

        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[140px] h-7 text-xs">
            <SelectValue placeholder="All Sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="window_tracker">Window Tracker</SelectItem>
            <SelectItem value="cc_transcript">CC Transcripts</SelectItem>
          </SelectContent>
        </Select>

        <Select value={activityTypeFilter} onValueChange={setActivityTypeFilter}>
          <SelectTrigger className="w-[150px] h-7 text-xs">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="coding">Coding</SelectItem>
            <SelectItem value="browser_local">Browser (Local)</SelectItem>
            <SelectItem value="browser_prod">Browser (Prod)</SelectItem>
            <SelectItem value="slack">Slack</SelectItem>
            <SelectItem value="cc_turn">CC Turn</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={unassigned ? "default" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setUnassigned(!unassigned)}
        >
          Unassigned
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <List className="h-4 w-4" />
                Unified Activity Log
              </CardTitle>
              <CardDescription>
                Window tracker snapshots and CC transcript turns
                {total > 0 && ` \u2022 ${total.toLocaleString()} entries`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-8 text-sm">Loading...</p>
          ) : snapshots.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 text-sm">No entries found.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="w-8">Src</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Org</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshots.map((s) => {
                    const isExpanded = expandedId === s.id;
                    const bgClass = ACTIVITY_BG_CLASSES[s.activityType] || ACTIVITY_BG_CLASSES.other;
                    const SourceIcon = s.source === "cc_transcript" ? Bot : Terminal;

                    // Detail column
                    let detail = "";
                    if (s.source === "cc_transcript" && s.ccUserChars) {
                      detail = `${s.ccUserChars.toLocaleString()} chars`;
                    } else if (s.activityType === "slack" && s.slackWorkspace) {
                      detail = s.slackChannel
                        ? `${s.slackWorkspace} / ${s.slackChannel}`
                        : s.slackWorkspace;
                    } else if (
                      s.activityType?.startsWith("browser_") &&
                      s.chromeProfile
                    ) {
                      detail = s.chromeProfile;
                    } else if (s.app) {
                      detail = s.app;
                    }

                    return (
                      <Fragment key={s.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setExpandedId(isExpanded ? null : s.id)}
                        >
                          <TableCell className="w-8 pr-0">
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-mono whitespace-nowrap">
                            {formatTimestamp(s.timestamp)}
                          </TableCell>
                          <TableCell className="text-xs font-mono whitespace-nowrap">
                            {s.durationSeconds
                              ? formatDuration(s.durationSeconds)
                              : "10s"}
                          </TableCell>
                          <TableCell className="w-8">
                            <span title={s.source === "cc_transcript" ? "CC Transcript" : "Window Tracker"}>
                              <SourceIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="text-xs gap-1"
                              style={{
                                borderColor: ACTIVITY_COLORS[s.activityType] || ACTIVITY_COLORS.other,
                              }}
                            >
                              <span
                                className={`inline-block h-1.5 w-1.5 rounded-full ${bgClass}`}
                              />
                              {ACTIVITY_LABELS[s.activityType] || s.activityType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {s.projectId ? (
                              <ProjectBadge
                                projectId={s.projectId}
                                projectName={
                                  projectNames[s.projectId] ||
                                  s.projectName ||
                                  "Unknown"
                                }
                                configs={configs}
                                size="sm"
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Unmatched
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {s.org || "\u2014"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {detail || "\u2014"}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-muted/30 p-0">
                              <div className="px-6 py-3 space-y-1.5 text-xs">
                                <MetaRow label="Window Title" value={s.windowTitle || "\u2014"} mono />
                                <MetaRow label="App" value={s.app || "\u2014"} />
                                <MetaRow label="Bundle ID" value={s.bundleId || "\u2014"} mono />
                                <MetaRow label="Source" value={s.source || "window_tracker"} />
                                <MetaRow
                                  label="Timestamp"
                                  value={`${new Date(s.timestamp).toISOString()} (${s.timestamp})`}
                                  mono
                                />
                                <MetaRow label="Activity Type" value={s.activityType} />
                                <MetaRow
                                  label="Duration"
                                  value={s.durationSeconds ? formatDuration(s.durationSeconds) : "10s"}
                                />
                                <MetaRow
                                  label="Matched Project"
                                  value={
                                    s.projectId
                                      ? `${projectNames[s.projectId] || s.projectName} (${s.projectId})`
                                      : "None"
                                  }
                                />
                                <MetaRow label="Org" value={s.org || "\u2014"} />
                                {s.url && <MetaRow label="URL" value={s.url} mono />}
                                {s.chromeProfile && (
                                  <MetaRow label="Chrome Profile" value={s.chromeProfile} />
                                )}
                                {s.browserCategory && (
                                  <MetaRow label="Browser Category" value={s.browserCategory} />
                                )}
                                {s.slackWorkspace && (
                                  <MetaRow label="Slack Workspace" value={s.slackWorkspace} />
                                )}
                                {s.slackChannel && (
                                  <MetaRow
                                    label="Slack Channel"
                                    value={`${s.slackChannel} (${s.slackChannelType || "unknown"})`}
                                  />
                                )}
                                {s.ccSessionId && (
                                  <MetaRow label="CC Session" value={s.ccSessionId} mono />
                                )}
                                {s.ccUserChars > 0 && (
                                  <MetaRow
                                    label="CC User Chars"
                                    value={s.ccUserChars.toLocaleString()}
                                  />
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t">
                  <span className="text-xs text-muted-foreground">
                    Page {page + 1} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page === 0}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
