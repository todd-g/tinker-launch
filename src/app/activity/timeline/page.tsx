"use client";

import { Button } from "@/components/ui/button";
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
import { useDbQuery } from "@/hooks/use-db";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo, useRef, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Image from "next/image";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

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
  ccSessionId: string;
  ccUserChars: number;
}

interface ProjectConfig {
  color?: string;
  favicon?: string;
}

interface ProjectInfo {
  id: string;
  projectName: string;
  org: string;
}

interface ProjectRow {
  projectId: string | null;
  projectName: string;
  org: string;
  blocks: SnapshotRow[];
  totalMinutes: number;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const ACTIVITY_COLORS: Record<string, string> = {
  coding: "#3b82f6",
  browser_local: "#22c55e",
  browser_staging: "#f59e0b",
  browser_prod: "#a855f7",
  xcode: "#06b6d4",
  slack: "#e11d48",
  cc_turn: "#8b5cf6",
  meeting: "#f97316",
  other: "#6b7280",
};

const ACTIVITY_LABELS: Record<string, string> = {
  coding: "Coding",
  browser_local: "Browser (Local)",
  browser_staging: "Browser (Staging)",
  browser_prod: "Browser (Prod)",
  xcode: "Xcode",
  slack: "Slack",
  cc_turn: "CC Turn",
  meeting: "Meeting",
  other: "Other",
};

// CC turns use a lighter/darker variant of the project color
const CC_SOURCE_TYPES = new Set(["cc_turn"]);

const ROW_HEIGHT = 36;
const LABEL_WIDTH = 180;
const MIN_BLOCK_WIDTH = 2;
const DAY_SECONDS = 86400;

// Zoom levels: pixels per minute
const ZOOM_LEVELS = [0.5, 1, 2, 4, 8];
const DEFAULT_ZOOM_INDEX = 2; // 2px/min = 2880px total

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
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
  const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p2 = 2 * l - q2;
  const r = Math.round(hue2rgb(p2, q2, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p2, q2, h) * 255);
  const b = Math.round(hue2rgb(p2, q2, h - 1 / 3) * 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** Parse a hex color into r,g,b */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

/** Lighten or darken a hex color. Amount > 0 = lighter, < 0 = darker */
function adjustColor(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const adjust = (c: number) => Math.max(0, Math.min(255, Math.round(c + amount)));
  const r = adjust(rgb.r);
  const g = adjust(rgb.g);
  const b = adjust(rgb.b);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** Get the display color for a block: use project color if available, else activity color.
 *  CC source entries get a lighter tone to distinguish from window tracker. */
function getBlockColor(snapshot: SnapshotRow, configs: Record<string, ProjectConfig>): string {
  let color: string;
  if (snapshot.projectId) {
    const config = configs[snapshot.projectId];
    if (config?.color) {
      const hex = hslToHex(config.color);
      color = hex || config.color;
    } else {
      color = ACTIVITY_COLORS[snapshot.activityType] || ACTIVITY_COLORS.other;
    }
  } else {
    color = ACTIVITY_COLORS[snapshot.activityType] || ACTIVITY_COLORS.other;
  }
  // CC source: shift to a lighter tone
  if (CC_SOURCE_TYPES.has(snapshot.activityType)) {
    return adjustColor(color, 50);
  }
  return color;
}

// ──────────────────────────────────────────────
// Tooltip
// ──────────────────────────────────────────────

function BlockTooltip({ snapshot, style }: { snapshot: SnapshotRow; style: React.CSSProperties }) {
  return (
    <div
      className="absolute z-50 bg-popover text-popover-foreground border rounded-md shadow-md p-2 text-xs space-y-1 pointer-events-none w-64"
      style={style}
    >
      <div className="font-medium">{formatTime(snapshot.timestamp)}</div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Duration</span>
        <span>{formatDuration(snapshot.durationSeconds)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Type</span>
        <span>{ACTIVITY_LABELS[snapshot.activityType] || snapshot.activityType}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Source</span>
        <span>{snapshot.source === "cc_transcript" ? "CC Transcript" : "Window Tracker"}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground shrink-0">App</span>
        <span className="truncate text-right">{snapshot.app}</span>
      </div>
      {snapshot.windowTitle && (
        <div className="text-muted-foreground truncate">{snapshot.windowTitle}</div>
      )}
      {snapshot.ccUserChars > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">User chars</span>
          <span>{snapshot.ccUserChars.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Hour markers
// ──────────────────────────────────────────────

function HourMarkers({ timelineWidth }: { timelineWidth: number }) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div className="relative h-6 border-b border-border" style={{ width: timelineWidth }}>
      {hours.map((h) => {
        const left = (h / 24) * timelineWidth;
        return (
          <div key={h} className="absolute top-0 h-full" style={{ left }}>
            <div className="absolute top-0 h-full w-px bg-border" />
            <span className="absolute top-0.5 left-1 text-[10px] text-muted-foreground whitespace-nowrap">
              {h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────
// Project row
// ──────────────────────────────────────────────

function TimelineRow({
  row,
  dayStart,
  configs,
  hoveredId,
  setHoveredId,
  hoveredRow,
  setHoveredRow,
  timelineWidth,
}: {
  row: ProjectRow;
  dayStart: number;
  configs: Record<string, ProjectConfig>;
  hoveredId: number | null;
  setHoveredId: (id: number | null) => void;
  hoveredRow: string | null;
  setHoveredRow: (id: string | null) => void;
  timelineWidth: number;
}) {
  const rowKey = row.projectId || "__unmatched__";
  const isRowHovered = hoveredRow === rowKey;

  return (
    <div
      className="relative border-b border-border transition-colors"
      style={{
        height: ROW_HEIGHT,
        width: timelineWidth,
        backgroundColor: isRowHovered ? "var(--muted)" : undefined,
      }}
      onMouseEnter={() => setHoveredRow(rowKey)}
      onMouseLeave={() => setHoveredRow(null)}
    >
      {/* Hour grid lines */}
      {Array.from({ length: 24 }, (_, h) => (
        <div
          key={h}
          className="absolute top-0 h-full w-px bg-border/30"
          style={{ left: (h / 24) * timelineWidth }}
        />
      ))}
      {/* All blocks in a single lane */}
      {row.blocks.map((snapshot) => {
        const offsetSec = (snapshot.timestamp - dayStart) / 1000;
        const left = (offsetSec / DAY_SECONDS) * timelineWidth;
        const width = Math.max(MIN_BLOCK_WIDTH, (snapshot.durationSeconds / DAY_SECONDS) * timelineWidth);
        const color = getBlockColor(snapshot, configs);
        const isHovered = hoveredId === snapshot.id;
        return (
          <div
            key={snapshot.id}
            className="absolute rounded-sm cursor-pointer"
            style={{
              left,
              width,
              top: 3,
              height: ROW_HEIGHT - 6,
              backgroundColor: color,
              opacity: isHovered ? 1 : 0.85,
              zIndex: isHovered ? 10 : 1,
              outline: isHovered ? "2px solid var(--foreground)" : undefined,
              outlineOffset: -1,
            }}
            onMouseEnter={() => setHoveredId(snapshot.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {isHovered && (
              <BlockTooltip
                snapshot={snapshot}
                style={{ top: ROW_HEIGHT - 2, left: 0 }}
              />
            )}
          </div>
        );
      })}
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
// Main page inner
// ──────────────────────────────────────────────

function TimelinePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const today = toDateString(new Date());
  const date = searchParams.get("date") || today;
  const orgFilter = searchParams.get("org") || "all";
  const projectFilter = searchParams.get("project") || "all";

  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);

  const pxPerMin = ZOOM_LEVELS[zoomIndex];
  const timelineWidth = pxPerMin * 1440; // 1440 minutes in a day

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if ((key === "date" && value === today) || (key !== "date" && value === "all")) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, router, pathname, today]
  );

  function prevDay() {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() - 1);
    updateParam("date", toDateString(d));
  }
  function nextDay() {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + 1);
    updateParam("date", toDateString(d));
  }
  function goToday() {
    updateParam("date", today);
  }

  function zoomIn() {
    // Preserve scroll center when zooming
    const container = scrollRef.current;
    const centerRatio = container
      ? (container.scrollLeft + container.clientWidth / 2) / timelineWidth
      : 0.5;

    setZoomIndex((i) => {
      const next = Math.min(i + 1, ZOOM_LEVELS.length - 1);
      // After state update, adjust scroll to keep center
      requestAnimationFrame(() => {
        if (container) {
          const newWidth = ZOOM_LEVELS[next] * 1440;
          container.scrollLeft = centerRatio * newWidth - container.clientWidth / 2;
        }
      });
      return next;
    });
  }

  function zoomOut() {
    const container = scrollRef.current;
    const centerRatio = container
      ? (container.scrollLeft + container.clientWidth / 2) / timelineWidth
      : 0.5;

    setZoomIndex((i) => {
      const next = Math.max(i - 1, 0);
      requestAnimationFrame(() => {
        if (container) {
          const newWidth = ZOOM_LEVELS[next] * 1440;
          container.scrollLeft = centerRatio * newWidth - container.clientWidth / 2;
        }
      });
      return next;
    });
  }

  // Data fetching
  const queryParams: Record<string, string> = {
    startDate: date,
    endDate: date,
    limit: "10000",
  };
  if (orgFilter !== "all") queryParams.org = orgFilter;
  if (projectFilter !== "all") queryParams.projectId = projectFilter;

  const { data, loading } = useDbQuery<{ success: boolean; data: SnapshotRow[]; total: number }>(
    "/api/db/activity-snapshots",
    queryParams
  );
  const snapshots = data?.data || [];

  const { data: projectsData } = useDbQuery<{ success: boolean; projects: ProjectInfo[] }>("/api/db/projects");
  const projects = projectsData?.projects || [];

  const { data: configsData } = useDbQuery<{ success: boolean; configs: Record<string, ProjectConfig> }>("/api/project-configs");
  const configs = configsData?.configs || {};

  const projectNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projects) map[p.id] = p.projectName;
    return map;
  }, [projects]);

  const orgs = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) if (p.org) set.add(p.org);
    return [...set].sort();
  }, [projects]);

  const filteredProjects = useMemo(() => {
    if (orgFilter === "all") return projects;
    return projects.filter((p) => p.org === orgFilter);
  }, [projects, orgFilter]);

  // Day start timestamp (midnight local time)
  const dayStart = useMemo(() => new Date(date + "T00:00:00").getTime(), [date]);

  // Group snapshots into project rows
  const rows = useMemo(() => {
    const map: Record<string, ProjectRow> = {};
    for (const s of snapshots) {
      const key = s.projectId || "__unmatched__";
      if (!map[key]) {
        map[key] = {
          projectId: s.projectId,
          projectName: s.projectId
            ? projectNames[s.projectId] || s.projectName || "Unknown"
            : "Unmatched",
          org: s.org || "",
          blocks: [],
          totalMinutes: 0,
        };
      }
      map[key].blocks.push(s);
      map[key].totalMinutes += s.durationSeconds / 60;
    }
    const result = Object.values(map);
    result.sort((a, b) => {
      if (!a.projectId) return 1;
      if (!b.projectId) return -1;
      return b.totalMinutes - a.totalMinutes;
    });
    return result;
  }, [snapshots, projectNames]);

  // Auto-scroll to first activity on load
  useEffect(() => {
    if (snapshots.length === 0 || !scrollRef.current) return;
    const earliest = Math.min(...snapshots.map((s) => s.timestamp));
    const offsetSec = (earliest - dayStart) / 1000;
    const scrollTo = Math.max(0, (offsetSec / DAY_SECONDS) * timelineWidth - 100);
    scrollRef.current.scrollLeft = scrollTo;
  }, [snapshots, dayStart, timelineWidth]);

  const isToday = date === today;

  // Legend: only types present in data
  const activeTypes = useMemo(() => {
    const set = new Set<string>();
    for (const s of snapshots) set.add(s.activityType);
    return [...set].sort();
  }, [snapshots]);

  const zoomLabel = pxPerMin < 1 ? `${pxPerMin}x` : `${pxPerMin}x`;

  return (
    <div className="space-y-3">
      {/* Day nav + filters + zoom */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={prevDay}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[180px] text-center">
            {formatDateLabel(date)}
          </span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={nextDay}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isToday && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={goToday}>
              Today
            </Button>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={zoomOut}
            disabled={zoomIndex === 0}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[10px] text-muted-foreground w-6 text-center tabular-nums">
            {zoomLabel}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={zoomIn}
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Select value={orgFilter} onValueChange={(v) => updateParam("org", v)}>
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
          value={projectFilter}
          onChange={(v) => updateParam("project", v)}
          projects={filteredProjects}
        />

        <span className="text-xs text-muted-foreground ml-auto">
          {snapshots.length > 0 ? `${snapshots.length} entries` : ""}
        </span>
      </div>

      {/* Legend */}
      {activeTypes.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap text-xs">
          {activeTypes.map((type) => {
            const baseColor = ACTIVITY_COLORS[type] || ACTIVITY_COLORS.other;
            const isCC = CC_SOURCE_TYPES.has(type);
            return (
              <span key={type} className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: isCC ? adjustColor(baseColor, 50) : baseColor }}
                />
                <span className="text-muted-foreground">{ACTIVITY_LABELS[type] || type}</span>
                {isCC && <span className="text-muted-foreground/60 text-[10px]">(lighter)</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="text-center text-muted-foreground py-12 text-sm">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 text-sm">
          No activity for {formatDateLabel(date)}
        </div>
      ) : (
        <div className="border rounded-md bg-card overflow-hidden">
          <div className="flex">
            {/* Left labels column — sticky */}
            <div
              className="shrink-0 border-r border-border bg-card z-20"
              style={{ width: LABEL_WIDTH, position: "sticky", left: 0 }}
            >
              {/* Header */}
              <div className="h-6 border-b border-border flex items-center px-2">
                <span className="text-[10px] text-muted-foreground font-medium">Project</span>
              </div>
              {rows.map((row) => {
                const rowKey = row.projectId || "__unmatched__";
                const config = row.projectId ? configs[row.projectId] : undefined;
                const faviconSrc = config?.favicon
                  ? `/api/favicon?path=${encodeURIComponent(config.favicon)}`
                  : null;
                const isRowHovered = hoveredRow === rowKey;
                return (
                  <div
                    key={rowKey}
                    className="flex items-center gap-1.5 px-2 border-b border-border transition-colors"
                    style={{
                      height: ROW_HEIGHT,
                      backgroundColor: isRowHovered ? "var(--muted)" : undefined,
                    }}
                    onMouseEnter={() => setHoveredRow(rowKey)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    {faviconSrc && (
                      <Image
                        src={faviconSrc}
                        alt=""
                        width={12}
                        height={12}
                        className="shrink-0"
                        unoptimized
                      />
                    )}
                    <span className="text-xs font-medium truncate">
                      {row.projectName}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                      {formatMinutes(row.totalMinutes)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Scrollable timeline area */}
            <div ref={scrollRef} className="overflow-x-auto flex-1">
              <div style={{ width: timelineWidth }}>
                <HourMarkers timelineWidth={timelineWidth} />
                {rows.map((row) => (
                  <TimelineRow
                    key={row.projectId || "__unmatched__"}
                    row={row}
                    dayStart={dayStart}
                    configs={configs}
                    hoveredId={hoveredId}
                    setHoveredId={setHoveredId}
                    hoveredRow={hoveredRow}
                    setHoveredRow={setHoveredRow}
                    timelineWidth={timelineWidth}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Page wrapper
// ──────────────────────────────────────────────

export default function TimelinePage() {
  return (
    <Suspense>
      <TimelinePageInner />
    </Suspense>
  );
}
