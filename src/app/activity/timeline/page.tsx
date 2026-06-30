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
  HelpCircle,
  Calendar as CalendarIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
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
  browser_email: "#ea4335",
  browser_docs: "#4285f4",
  browser_figma: "#a259ff",
  browser_linear: "#5e6ad2",
  browser_webflow: "#4353ff",
  browser_workflow: "#14b8a6",
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
  browser_email: "Gmail",
  browser_docs: "Google Docs",
  browser_figma: "Figma",
  browser_linear: "Linear",
  browser_webflow: "Webflow",
  browser_workflow: "Workflow",
  xcode: "Xcode",
  slack: "Slack",
  cc_turn: "Claude Code",
  meeting: "Meeting",
  other: "Other",
};

// CC turns use a lighter/darker variant of the project color
const CC_SOURCE_TYPES = new Set(["cc_turn"]);

const ACTIVITY_ICON_SRCS: Record<string, string> = {
  coding: "/icons/terminal.svg",
  browser_local: "/icons/chrome.png",
  browser_staging: "/icons/chrome.png",
  browser_prod: "/icons/chrome.png",
  browser_email: "/icons/gmail.ico",
  browser_docs: "/icons/gdocs.ico",
  browser_figma: "/icons/figma.png",
  browser_linear: "/icons/linear.ico",
  browser_webflow: "/icons/webflow.ico",
  browser_workflow: "/icons/chrome.png",

  xcode: "/icons/xcode.png",
  slack: "/icons/slack.png",
  cc_turn: "/icons/claude.ico",
  meeting: "/icons/zoom.ico",
};

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
// Rollup helpers (Week / Month aggregation)
// ──────────────────────────────────────────────

const FALLBACK_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ef4444",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#f43f5e", "#8b5cf6", "#10b981", "#0ea5e9",
];

function resolveProjectColor(config: ProjectConfig | undefined, fallback: string): string {
  if (config?.color) return hslToHex(config.color) || fallback;
  return fallback;
}

function faviconUrl(config: ProjectConfig | undefined): string | null {
  if (!config?.favicon) return null;
  return `/api/favicon?path=${encodeURIComponent(config.favicon)}`;
}

function formatHours(minutes: number): string {
  const h = minutes / 60;
  if (h >= 10) return `${h.toFixed(1)}h`;
  if (h >= 1) return `${h.toFixed(2)}h`;
  return `${Math.round(minutes)}m`;
}

function formatDayShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return toDateString(d);
}

function eachDay(startStr: string, endStr: string): string[] {
  const out: string[] = [];
  const end = new Date(endStr + "T12:00:00").getTime();
  let d = new Date(startStr + "T12:00:00");
  while (d.getTime() <= end) {
    out.push(toDateString(d));
    d = new Date(d.getTime());
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || url;
  }
}

// ──────────────────────────────────────────────
// Tooltip
// ──────────────────────────────────────────────

function ActivityIcon({ type, size = 16 }: { type: string; size?: number }) {
  const src = ACTIVITY_ICON_SRCS[type];
  if (!src) return <HelpCircle style={{ width: size, height: size }} className="text-muted-foreground" />;
  return <img src={src} alt="" width={size} height={size} className="shrink-0" style={{ width: size, height: size }} />;
}

function getTooltipDetails(snapshot: SnapshotRow): string[] {
  const lines: string[] = [];
  const type = snapshot.activityType;
  const isCC = type === "cc_turn";

  // URL for browser types
  if (type.startsWith("browser_") && snapshot.url) {
    lines.push(snapshot.url);
  }

  // Window title for non-CC types (strip browser/app suffixes)
  if (!isCC && snapshot.windowTitle) {
    let title = snapshot.windowTitle;
    // Strip " - Google Chrome - Profile" / " - Slack" / " - Zoom" etc
    title = title.replace(/\s*[-–—]\s*(Google Chrome|Brave|Safari|Arc|Slack|Zoom).*$/i, "");
    if (title) lines.push(title);
  }

  return lines;
}

function BlockTooltip({ snapshot, style }: { snapshot: SnapshotRow; style: React.CSSProperties }) {
  const details = getTooltipDetails(snapshot);
  return (
    <div
      className="fixed z-[100] bg-popover text-popover-foreground border rounded-md shadow-md p-1.5 text-xs space-y-0.5 pointer-events-none max-w-52"
      style={style}
    >
      <div className="flex items-center gap-1.5">
        <ActivityIcon type={snapshot.activityType} size={16} />
        <span className="text-muted-foreground">{formatDuration(snapshot.durationSeconds)}</span>
      </div>
      {details.map((line, i) => (
        <div key={i} className="text-muted-foreground truncate">{line}</div>
      ))}
      {snapshot.ccUserChars > 0 && (
        <div className="text-muted-foreground">{snapshot.ccUserChars.toLocaleString()} chars</div>
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
  setHoveredSnapshot,
  hoveredRow,
  setHoveredRow,
  timelineWidth,
}: {
  row: ProjectRow;
  dayStart: number;
  configs: Record<string, ProjectConfig>;
  hoveredId: number | null;
  setHoveredId: (id: number | null) => void;
  setHoveredSnapshot: (info: { snapshot: SnapshotRow; rect: DOMRect } | null) => void;
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
            onMouseEnter={(e) => {
              setHoveredId(snapshot.id);
              setHoveredSnapshot({ snapshot, rect: e.currentTarget.getBoundingClientRect() });
            }}
            onMouseLeave={() => {
              setHoveredId(null);
              setHoveredSnapshot(null);
            }}
          />
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
// Single-day picker (zero-dep calendar popover)
// ──────────────────────────────────────────────

function DayPicker({ value, label, onSelect }: {
  value: string;            // YYYY-MM-DD (selected / anchor day)
  label: string;            // text shown on the trigger
  onSelect: (d: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const sel = useMemo(() => new Date(value + "T12:00:00"), [value]);
  const [viewMonth, setViewMonth] = useState(() => new Date(sel.getFullYear(), sel.getMonth(), 1));
  const todayStr = toDateString(new Date());

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toDateString(new Date(year, month, d)));

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setViewMonth(new Date(sel.getFullYear(), sel.getMonth(), 1)); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-sm font-medium min-w-[180px] justify-center gap-1.5">
          <CalendarIcon className="h-3.5 w-3.5 opacity-60 shrink-0" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="center">
        <div className="flex items-center justify-between mb-2">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewMonth(new Date(year, month - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            {viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewMonth(new Date(year, month + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="text-[10px] text-muted-foreground py-1">{d}</div>
          ))}
          {cells.map((c, i) => c === null ? <div key={i} /> : (
            <button
              key={i}
              onClick={() => { onSelect(c); setOpen(false); }}
              className={cn(
                "h-7 w-7 rounded-md text-xs tabular-nums hover:bg-muted transition-colors",
                c === value && "bg-primary text-primary-foreground hover:bg-primary",
                c === todayStr && c !== value && "border border-border font-medium",
              )}
            >
              {Number(c.slice(-2))}
            </button>
          ))}
        </div>
        <div className="mt-2 flex justify-center">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
            onClick={() => { onSelect(todayStr); setOpen(false); }}>
            Today
          </Button>
        </div>
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
  const view = (searchParams.get("view") as "day" | "week" | "month") || "day";
  const windowDays = view === "week" ? 7 : view === "month" ? 30 : 1;
  const periodEnd = date;
  const periodStart = windowDays === 1 ? date : addDays(date, -(windowDays - 1));

  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [hoveredSnapshot, setHoveredSnapshot] = useState<{ snapshot: SnapshotRow; rect: DOMRect } | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

  const pxPerMin = ZOOM_LEVELS[zoomIndex];
  const timelineWidth = pxPerMin * 1440; // 1440 minutes in a day

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (
        (key === "date" && value === today) ||
        (key === "view" && value === "day") ||
        (key !== "date" && key !== "view" && value === "all")
      ) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, router, pathname, today]
  );

  function prevPeriod() {
    updateParam("date", addDays(date, -windowDays));
  }
  function nextPeriod() {
    updateParam("date", addDays(date, windowDays));
  }
  function goToday() {
    updateParam("date", today);
  }
  function setView(v: "day" | "week" | "month") {
    updateParam("view", v);
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

  // Filter snapshots by visible activity types
  const visibleSnapshots = useMemo(() => {
    if (hiddenTypes.size === 0) return snapshots;
    return snapshots.filter((s) => !hiddenTypes.has(s.activityType));
  }, [snapshots, hiddenTypes]);

  // Group snapshots into project rows
  const rows = useMemo(() => {
    const map: Record<string, ProjectRow> = {};
    for (const s of visibleSnapshots) {
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
  }, [visibleSnapshots, projectNames]);

  // Auto-scroll to first activity on load
  useEffect(() => {
    if (visibleSnapshots.length === 0 || !scrollRef.current) return;
    const earliest = Math.min(...visibleSnapshots.map((s) => s.timestamp));
    const offsetSec = (earliest - dayStart) / 1000;
    const scrollTo = Math.max(0, (offsetSec / DAY_SECONDS) * timelineWidth - 100);
    scrollRef.current.scrollLeft = scrollTo;
  }, [visibleSnapshots, dayStart, timelineWidth]);

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
        {/* View toggle: Day / Week / Month */}
        <div className="flex items-center gap-0.5">
          {(["day", "week", "month"] as const).map((v) => (
            <Button key={v} variant={view === v ? "default" : "ghost"} size="sm"
              className="h-7 px-2 text-xs capitalize" onClick={() => setView(v)}>
              {v}
            </Button>
          ))}
        </div>

        {/* Period nav */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={prevPeriod}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <DayPicker
            value={date}
            label={view === "day"
              ? formatDateLabel(date)
              : `${formatDayShort(periodStart)} – ${formatDayShort(periodEnd)}`}
            onSelect={(d) => updateParam("date", d)}
          />
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={nextPeriod}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isToday && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={goToday}>
              {view === "day" ? "Today" : "Now"}
            </Button>
          )}
        </div>

        {view === "day" && (
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
        )}

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

        {view === "day" && (
          <span className="text-xs text-muted-foreground ml-auto">
            {snapshots.length > 0
              ? hiddenTypes.size > 0
                ? `${visibleSnapshots.length} / ${snapshots.length} entries`
                : `${snapshots.length} entries`
              : ""}
          </span>
        )}
      </div>

      {/* Activity type filters */}
      {view === "day" && activeTypes.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap text-xs">
          <span className="text-muted-foreground text-[10px] uppercase tracking-wider mr-1">Display</span>
          {activeTypes.map((type) => {
            const baseColor = ACTIVITY_COLORS[type] || ACTIVITY_COLORS.other;
            const isHidden = hiddenTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => {
                  setHiddenTypes((prev) => {
                    const next = new Set(prev);
                    if (next.has(type)) next.delete(type);
                    else next.add(type);
                    return next;
                  });
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition-all",
                  isHidden
                    ? "border-border text-muted-foreground/40 bg-transparent opacity-40"
                    : "border-transparent text-foreground"
                )}
                style={!isHidden ? { backgroundColor: baseColor + "18", borderColor: baseColor + "40" } : undefined}
              >
                <ActivityIcon type={type} size={14} />
                <span>{ACTIVITY_LABELS[type] || type}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Week / Month rollup — same snapshot data, aggregated wider */}
      {view !== "day" ? (
        <PeriodRollup
          startDate={periodStart}
          endDate={periodEnd}
          org={orgFilter}
          projectFilter={projectFilter}
          projectNames={projectNames}
          configs={configs}
        />
      ) : /* Timeline */ loading ? (
        <div className="text-center text-muted-foreground py-12 text-sm">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 text-sm">
          No activity for {formatDateLabel(date)}
        </div>
      ) : (
        <div className="border rounded-md bg-card overflow-x-auto" ref={scrollRef}>
          <div className="flex w-fit">
            {/* Left labels column — sticky */}
            <div
              className="shrink-0 border-r border-border bg-card z-10"
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

            {/* Timeline area */}
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
                  setHoveredSnapshot={setHoveredSnapshot}
                  hoveredRow={hoveredRow}
                  setHoveredRow={setHoveredRow}
                  timelineWidth={timelineWidth}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tooltip rendered outside all containers, fixed to viewport */}
      {hoveredSnapshot && (
        <BlockTooltip
          snapshot={hoveredSnapshot.snapshot}
          style={{
            top: hoveredSnapshot.rect.bottom + 4,
            left: hoveredSnapshot.rect.left,
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Rollup (Week / Month) — same snapshot data as the gantt, aggregated wider
// ──────────────────────────────────────────────

interface DailyProjRow { day: string; projectId: string | null; minutes: number; entries: number }
interface TypeRow { activityType: string; minutes: number; entries: number }
interface AppRow { app: string; minutes: number; entries: number }
interface UrlRow { url: string; minutes: number; entries: number }

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

function RollupBarTooltip({ active, payload, label }: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: ReadonlyArray<any>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const visible = [...payload].filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  const total = visible.reduce((s, p) => s + p.value, 0);
  return (
    <div className="rounded-lg border bg-background p-2.5 shadow-md text-xs space-y-1 min-w-[140px]">
      <p className="font-medium mb-1.5">{label}</p>
      {visible.slice(0, 10).map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm shrink-0" style={{ background: p.color }} />
            <span className="text-muted-foreground truncate max-w-[120px]">{p.name}</span>
          </span>
          <span className="font-mono font-medium">{formatHours(p.value)}</span>
        </div>
      ))}
      {visible.length > 1 && (
        <div className="flex justify-between pt-1 border-t mt-1">
          <span className="text-muted-foreground">Total</span>
          <span className="font-mono font-medium">{formatHours(total)}</span>
        </div>
      )}
    </div>
  );
}

function RollupPieTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { pct: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border bg-background p-2.5 shadow-md text-xs">
      <p className="font-medium">{p.name}</p>
      <p className="font-mono mt-0.5">{formatHours(p.value)}</p>
      <p className="text-muted-foreground">{(p.payload.pct * 100).toFixed(1)}%</p>
    </div>
  );
}

function MiniTable({ title, desc, rows, empty }: {
  title: string; desc: string; empty: string;
  rows: { name: string; entries: number; minutes: number }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <CardDescription className="text-xs">{desc}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground text-xs">{empty}</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left font-medium text-muted-foreground py-2 pl-6 pr-3">{title.replace("Top ", "")}</th>
                <th className="text-right font-medium text-muted-foreground py-2 px-3">Entries</th>
                <th className="text-right font-medium text-muted-foreground py-2 pl-3 pr-6">Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                  <td className="py-2 pl-6 pr-3 font-medium truncate max-w-[220px]">{r.name}</td>
                  <td className="py-2 px-3 text-right font-mono text-muted-foreground">{r.entries}</td>
                  <td className="py-2 pl-3 pr-6 text-right font-mono">{formatHours(r.minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function PieWithLegend({ title, desc, data, withFavicons, configs }: {
  title: string; desc: string;
  data: { name: string; value: number; color: string; pct: number; id?: string }[];
  withFavicons?: boolean;
  configs?: Record<string, ProjectConfig>;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <CardDescription className="text-xs">{desc}</CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        {data.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-xs">No data.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius="52%" outerRadius="78%"
                  paddingAngle={2} dataKey="value" strokeWidth={0}>
                  {data.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
                <RTooltip content={<RollupPieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-1.5 mt-1">
              {data.slice(0, 12).map((entry) => {
                const fav = withFavicons && entry.id && configs ? faviconUrl(configs[entry.id]) : null;
                return (
                  <div key={entry.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {fav ? (
                        <Image src={fav} alt="" width={12} height={12} className="shrink-0 rounded-sm" unoptimized />
                      ) : (
                        <span className="inline-block h-2 w-2 rounded-sm shrink-0" style={{ background: entry.color }} />
                      )}
                      <span className="truncate max-w-[150px]">{entry.name}</span>
                    </span>
                    <span className="font-mono text-muted-foreground">{(entry.pct * 100).toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PeriodRollup({
  startDate, endDate, org, projectFilter, projectNames, configs,
}: {
  startDate: string;
  endDate: string;
  org: string;
  projectFilter: string;
  projectNames: Record<string, string>;
  configs: Record<string, ProjectConfig>;
}) {
  const base: Record<string, string> = { startDate, endDate };
  if (org !== "all") base.org = org;
  if (projectFilter !== "all") base.projectId = projectFilter;
  // "all projects" view = project-attributed time only (exclude Unmatched), matching
  // the user's per-project intent. Drop this line to fold Unmatched activity back in.
  if (projectFilter === "all") base.assigned = "1";

  const { data: dailyData, loading: l1 } = useDbQuery<{ success: boolean; data: DailyProjRow[] }>(
    "/api/db/activity-snapshots", { ...base, byDay: "1", groupBy: "projectId" }
  );
  const { data: typeData, loading: l2 } = useDbQuery<{ success: boolean; data: TypeRow[] }>(
    "/api/db/activity-snapshots", { ...base, groupBy: "activityType" }
  );
  const { data: appData } = useDbQuery<{ success: boolean; data: AppRow[] }>(
    "/api/db/activity-snapshots", { ...base, groupBy: "app" }
  );
  const { data: urlData } = useDbQuery<{ success: boolean; data: UrlRow[] }>(
    "/api/db/activity-snapshots", { ...base, groupBy: "url" }
  );

  const dailyRows = useMemo(() => (dailyData?.data || []).filter((r) => r.projectId), [dailyData]);
  const typeRows = useMemo(() => typeData?.data || [], [typeData]);
  const days = useMemo(() => eachDay(startDate, endDate), [startDate, endDate]);

  const projectTotals = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of dailyRows) m[r.projectId!] = (m[r.projectId!] || 0) + r.minutes;
    return m;
  }, [dailyRows]);

  const projectsSorted = useMemo(() =>
    Object.keys(projectTotals)
      .map((id) => ({ id, name: projectNames[id] || id.slice(0, 8), value: projectTotals[id] }))
      .sort((a, b) => b.value - a.value),
    [projectTotals, projectNames]
  );

  const projectColors = useMemo(() => {
    const m: Record<string, string> = {};
    projectsSorted.forEach(({ id }, i) => {
      m[id] = resolveProjectColor(configs[id], FALLBACK_COLORS[i % FALLBACK_COLORS.length]);
    });
    return m;
  }, [projectsSorted, configs]);

  const barData = useMemo(() => {
    const byDay: Record<string, Record<string, number>> = {};
    for (const r of dailyRows) {
      if (!byDay[r.day]) byDay[r.day] = {};
      byDay[r.day][r.projectId!] = (byDay[r.day][r.projectId!] || 0) + r.minutes;
    }
    return days.map((d) => {
      const e: Record<string, number | string> = { date: formatDayShort(d) };
      for (const { id } of projectsSorted) e[id] = byDay[d]?.[id] || 0;
      return e;
    });
  }, [dailyRows, days, projectsSorted]);

  const projectPie = useMemo(() => {
    const total = projectsSorted.reduce((s, p) => s + p.value, 0);
    return projectsSorted.filter((p) => p.value > 0).map((p, i) => ({
      name: p.name, value: p.value, id: p.id,
      color: projectColors[p.id] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      pct: total > 0 ? p.value / total : 0,
    }));
  }, [projectsSorted, projectColors]);

  const catTotals = useMemo(() => {
    let cc = 0, browser = 0, slack = 0, xcode = 0, other = 0, total = 0;
    for (const r of typeRows) {
      total += r.minutes;
      if (r.activityType === "cc_turn") cc += r.minutes;
      else if (r.activityType.startsWith("browser_")) browser += r.minutes;
      else if (r.activityType === "slack") slack += r.minutes;
      else if (r.activityType === "xcode") xcode += r.minutes;
      else other += r.minutes;
    }
    return { cc, browser, slack, xcode, other, total };
  }, [typeRows]);

  const typePie = useMemo(() => {
    const total = typeRows.reduce((s, r) => s + r.minutes, 0);
    return [...typeRows]
      .filter((r) => r.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes)
      .map((r) => ({
        name: ACTIVITY_LABELS[r.activityType] || r.activityType,
        value: r.minutes,
        color: ACTIVITY_COLORS[r.activityType] || ACTIVITY_COLORS.other,
        pct: total > 0 ? r.minutes / total : 0,
      }));
  }, [typeRows]);

  const topApps = useMemo(() =>
    (appData?.data || [])
      .map((r) => ({ name: (r.app || "").trim(), minutes: r.minutes, entries: r.entries }))
      .filter((r) => r.name !== "")
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 12),
    [appData]
  );

  const topSites = useMemo(() => {
    const m = new Map<string, { minutes: number; entries: number }>();
    for (const r of (urlData?.data || [])) {
      const u = (r.url || "").trim();
      if (!u) continue;
      const h = hostname(u);
      const cur = m.get(h) || { minutes: 0, entries: 0 };
      cur.minutes += r.minutes; cur.entries += r.entries;
      m.set(h, cur);
    }
    return [...m.entries()].map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.minutes - a.minutes).slice(0, 12);
  }, [urlData]);

  const pctOf = (x: number) => (catTotals.total > 0 ? `${Math.round((100 * x) / catTotals.total)}%` : "0%");
  const tickInterval = days.length > 14 ? Math.floor(days.length / 10) : 0;
  const loading = l1 || l2;

  if (loading && dailyRows.length === 0 && typeRows.length === 0) {
    return <div className="text-center text-muted-foreground py-12 text-sm">Loading…</div>;
  }
  if (!loading && dailyRows.length === 0 && typeRows.length === 0) {
    return <div className="text-center text-muted-foreground py-12 text-sm">No activity for this period.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Tracked Time" value={formatHours(catTotals.total)}
          sub={`across ${projectsSorted.length} project${projectsSorted.length !== 1 ? "s" : ""}`} />
        <StatCard label="Claude Code" value={formatHours(catTotals.cc)} sub={`${pctOf(catTotals.cc)} of tracked`} />
        <StatCard label="Browser" value={formatHours(catTotals.browser)} sub={`${pctOf(catTotals.browser)} of tracked`} />
        <StatCard label="Slack + Other" value={formatHours(catTotals.slack + catTotals.xcode + catTotals.other)}
          sub={`${pctOf(catTotals.slack + catTotals.xcode + catTotals.other)} of tracked`} />
      </div>

      {/* Per-day stacked bar (by project) + project donut */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px] lg:items-stretch">
        <Card className="flex flex-col">
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="text-sm font-medium">Activity Over Time</CardTitle>
            <CardDescription className="text-xs">Tracked time per day, stacked by project</CardDescription>
          </CardHeader>
          <CardContent className="pb-4 flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={tickInterval} />
                  <YAxis tickFormatter={(v) => formatHours(v)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                  <RTooltip content={<RollupBarTooltip />} />
                  {projectsSorted.map(({ id, name }, i) => (
                    <Bar key={id} dataKey={id} name={name} stackId="a" fill={projectColors[id]}
                      radius={i === projectsSorted.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            {projectsSorted.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 justify-center shrink-0">
                {projectsSorted.slice(0, 12).map(({ id, name }) => {
                  const fav = faviconUrl(configs[id]);
                  return (
                    <span key={id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {fav ? (
                        <Image src={fav} alt="" width={12} height={12} className="shrink-0 rounded-sm" unoptimized />
                      ) : (
                        <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: projectColors[id] }} />
                      )}
                      {name}
                    </span>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <PieWithLegend title="Project Share" desc="By project for period" data={projectPie} withFavicons configs={configs} />
      </div>

      {/* Activity-type donut + drill-downs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr_1fr]">
        <PieWithLegend title="Activity Types" desc="By app / activity for period" data={typePie} />
        <MiniTable title="Top Apps" desc="Most-used apps for this period" rows={topApps} empty="No app data." />
        <MiniTable title="Top Sites" desc="Most-visited sites for this period" rows={topSites} empty="No browsing data." />
      </div>
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
