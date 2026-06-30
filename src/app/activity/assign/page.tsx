"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useDbQuery, useDbMutation } from "@/hooks/use-db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Cluster {
  id: number;
  day: string;
  app: string;
  urlHost: string;
  sampleTitle: string;
  sampleUrl: string;
  minutes: number;
  startTs: number;
  endTs: number;
  status: "pending" | "suggested" | "applied" | "rejected";
  suggestedProjectId: string | null;
  confidence: number | null;
  reason: string;
}

interface ProjectInfo { id: string; projectName: string; org: string }
interface ProjectConfig { color?: string; favicon?: string }

function faviconUrl(config: ProjectConfig | undefined): string | null {
  if (!config?.favicon) return null;
  return `/api/favicon?path=${encodeURIComponent(config.favicon)}`;
}

function formatMin(min: number): string {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function timeRange(startTs: number, endTs: number): string {
  const f = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${f(startTs)}–${f(endTs)}`;
}

function formatDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Resolve an app/site icon from the icons already wired up in /public/icons.
// Host-specific (for browser activity) wins over the generic browser icon.
function appIcon(app: string, host: string): string | null {
  const a = (app || "").toLowerCase();
  const h = (host || "").toLowerCase();
  if (h.includes("mail.google")) return "/icons/gmail.ico";
  if (h.includes("docs.google")) return "/icons/gdocs.ico";
  if (h.includes("figma.com")) return "/icons/figma.png";
  if (h.includes("linear.app")) return "/icons/linear.ico";
  if (h.includes("webflow")) return "/icons/webflow.ico";
  if (a.includes("zoom")) return "/icons/zoom.ico";
  if (a.includes("slack")) return "/icons/slack.png";
  if (a.includes("xcode")) return "/icons/xcode.png";
  if (a.includes("claude")) return "/icons/claude.ico";
  if (/terminal|iterm|ghostty|warp|kitty/.test(a)) return "/icons/terminal.svg";
  if (/chrome|safari|brave|arc|firefox|edge/.test(a)) return "/icons/chrome.png";
  return null;
}

function jobLabel(job: string): string {
  return job === "assign_classify" ? "Classifier" : job === "assign_queue_build" ? "Queue build" : job;
}

function runResult(r: JobRunRow): string {
  try {
    const d = JSON.parse(r.detail);
    if (typeof d === "string") return d;
    if (r.job === "assign_queue_build") return `${d.clusters ?? "?"} clusters from ${d.snapshots ?? "?"} snapshots`;
    if (r.job === "assign_classify") return d.summary || (d.exitCode === 0 ? "done" : `exit ${d.exitCode}`);
    return (r.detail || "").slice(0, 200);
  } catch {
    return (r.detail || "").slice(0, 200);
  }
}

const STATUS_TABS = [
  { key: "suggested", label: "Suggested" },
  { key: "pending", label: "Pending" },
  { key: "applied", label: "Applied" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
] as const;

// Searchable project picker (combobox) — the project list is long, so support type-to-filter.
function ProjectPicker({ value, projects, onChange }: {
  value: string;
  projects: ProjectInfo[]; // expected pre-sorted alphabetically
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = value ? (projects.find((p) => p.id === value)?.projectName || "…") : "Pick project…";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open}
          className="w-[160px] h-7 text-xs justify-between font-normal">
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[230px] p-0" align="end">
        <Command>
          <CommandInput placeholder="Search projects..." className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty>No project found.</CommandEmpty>
            <CommandGroup>
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

interface JobRunRow {
  id: number;
  job: string;
  status: "running" | "success" | "error";
  startedAt: number;
  finishedAt: number | null;
  detail: string;
}

export default function AssignPage() {
  const [status, setStatus] = useState<string>("suggested");
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [showRuns, setShowRuns] = useState(false);

  const { data: queueData, refetch } = useDbQuery<{ success: boolean; data: Cluster[]; counts: Record<string, number> }>(
    "/api/suggest", { status }
  );
  const { data: projectsData } = useDbQuery<{ success: boolean; projects: ProjectInfo[] }>("/api/db/projects");
  const { data: configsData } = useDbQuery<{ success: boolean; configs: Record<string, ProjectConfig> }>("/api/project-configs");
  const { data: settingsData, refetch: refetchSettings } = useDbQuery<{ success: boolean; autoApproveThreshold: number; autoRejectThreshold: number }>(
    "/api/suggest/settings"
  );
  const { data: calData, refetch: refetchCal } = useDbQuery<{ success: boolean; syncIds: string[]; available: { id: string; summary: string }[] }>(
    "/api/calendar/settings"
  );
  const { data: runsData, refetch: refetchRuns } = useDbQuery<{ success: boolean; runs: JobRunRow[]; running: boolean }>(
    "/api/suggest/runs"
  );

  const runMut = useDbMutation("/api/suggest/run");
  const reviewMut = useDbMutation("/api/suggest/review");
  const settingsMut = useDbMutation("/api/suggest/settings");
  const calMut = useDbMutation("/api/calendar/settings");
  const classifyRunMut = useDbMutation("/api/suggest/classify-run");

  const clusters = useMemo(() => queueData?.data || [], [queueData]);
  const counts = queueData?.counts || {};
  const projects = useMemo(
    () => [...(projectsData?.projects || [])].sort((a, b) => a.projectName.localeCompare(b.projectName)),
    [projectsData]
  );
  const configs = configsData?.configs || {};
  const approveThreshold = settingsData?.autoApproveThreshold ?? 0.9;
  const rejectThreshold = settingsData?.autoRejectThreshold ?? 1.0;
  const syncIds = useMemo(() => calData?.syncIds || [], [calData]);
  const availableCals = useMemo(() => calData?.available || [], [calData]);

  const projectName = (id: string | null) => id ? (projects.find((p) => p.id === id)?.projectName || id.slice(0, 8)) : null;

  async function toggleCalendar(id: string) {
    const next = syncIds.includes(id) ? syncIds.filter((x) => x !== id) : [...syncIds, id];
    await calMut.mutate({ syncIds: next });
    await refetchCal();
  }

  // Spawn the LLM classifier locally, then poll until the run finishes and refresh the inbox.
  async function runClassifier() {
    const res = await classifyRunMut.mutate({});
    await refetchRuns();
    if (!res?.success) return; // error (e.g. already running) — shows in the runs log
    setClassifying(true);
    const poll = async () => {
      const r = await fetch("/api/suggest/runs").then((x) => x.json()).catch(() => null);
      await refetchRuns();
      if (r?.running) {
        setTimeout(poll, 4000);
      } else {
        setClassifying(false);
        await refetch();
      }
    };
    setTimeout(poll, 3000);
  }

  async function rebuild() {
    setBusy(true);
    await runMut.mutate({});
    await refetch();
    setBusy(false);
  }

  async function decide(id: number, action: "approve" | "reject") {
    const projectId = action === "approve" ? (overrides[id] || undefined) : undefined;
    setBusy(true);
    await reviewMut.mutate({ decisions: [{ id, action, projectId }] });
    await refetch();
    setBusy(false);
  }

  async function approveAll() {
    const ids = clusters.filter((c) => c.status === "suggested" && (overrides[c.id] || c.suggestedProjectId));
    if (ids.length === 0) return;
    setBusy(true);
    await reviewMut.mutate({
      decisions: ids.map((c) => ({ id: c.id, action: "approve", projectId: overrides[c.id] || c.suggestedProjectId! })),
    });
    await refetch();
    setBusy(false);
  }

  async function saveThresholds(patch: { autoApproveThreshold?: number; autoRejectThreshold?: number }) {
    await settingsMut.mutate(patch);
    await refetchSettings();
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-0.5">
          {STATUS_TABS.map((t) => (
            <Button key={t.key} variant={status === t.key ? "default" : "ghost"} size="sm"
              className="h-7 px-2 text-xs" onClick={() => setStatus(t.key)}>
              {t.label}
              {counts[t.key] != null && t.key !== "all" && (
                <span className="ml-1 text-[10px] opacity-70">{counts[t.key]}</span>
              )}
            </Button>
          ))}
        </div>

        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={rebuild} disabled={busy || classifying}>
          {busy ? "Working…" : "Rebuild queue"}
        </Button>
        <Button variant="default" size="sm" className="h-7 px-2 text-xs" onClick={runClassifier} disabled={busy || classifying}>
          {classifying ? "Classifying…" : "Run classifier"}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => { setShowRuns((s) => !s); refetchRuns(); }}>
          {showRuns ? "Hide runs" : "Runs"}
        </Button>

        <div className="flex items-center gap-1.5 ml-auto text-xs text-muted-foreground">
          <span>Auto-approve ≥</span>
          <Input
            type="number" min={0} max={1} step={0.05}
            defaultValue={approveThreshold}
            onBlur={(e) => saveThresholds({ autoApproveThreshold: parseFloat(e.target.value) })}
            className="h-7 w-16 text-xs"
          />
          <span className="ml-1">Auto-reject ≥</span>
          <Input
            type="number" min={0} max={1} step={0.05}
            defaultValue={rejectThreshold}
            onBlur={(e) => saveThresholds({ autoRejectThreshold: parseFloat(e.target.value) })}
            className="h-7 w-16 text-xs"
          />
        </div>
        {status === "suggested" && clusters.length > 0 && (
          <Button variant="default" size="sm" className="h-7 px-2 text-xs" onClick={approveAll} disabled={busy}>
            Approve all ({clusters.length})
          </Button>
        )}
      </div>

      {/* Calendar sync sources — meetings are matched against events from the checked calendars */}
      <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap text-xs text-muted-foreground">
        <span className="font-medium">Calendars synced:</span>
        {availableCals.length === 0 ? (
          <span>none yet — run <code className="text-foreground">/classify-unassigned</code> once to load your calendar list</span>
        ) : (
          availableCals.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5 cursor-pointer hover:text-foreground">
              <input type="checkbox" checked={syncIds.includes(c.id)} onChange={() => toggleCalendar(c.id)} className="accent-current" />
              <span className="truncate max-w-[180px]">{c.summary}</span>
            </label>
          ))
        )}
      </div>

      {/* Recent runs log */}
      {showRuns && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium text-muted-foreground py-2 pl-4 pr-3">Run</th>
                  <th className="text-left font-medium text-muted-foreground py-2 px-3">When</th>
                  <th className="text-left font-medium text-muted-foreground py-2 px-3">Status</th>
                  <th className="text-left font-medium text-muted-foreground py-2 px-3">Result</th>
                  <th className="text-right font-medium text-muted-foreground py-2 pl-3 pr-4">Took</th>
                </tr>
              </thead>
              <tbody>
                {(runsData?.runs || []).map((r) => (
                  <tr key={`${r.job}-${r.id}`} className="border-b last:border-0">
                    <td className="py-1.5 pl-4 pr-3 font-medium whitespace-nowrap">{jobLabel(r.job)}</td>
                    <td className="py-1.5 px-3 text-muted-foreground whitespace-nowrap">
                      {new Date(r.startedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="py-1.5 px-3">
                      <span className={r.status === "success" ? "text-green-600" : r.status === "error" ? "text-red-600" : "text-amber-600"}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-muted-foreground truncate max-w-[360px]" title={runResult(r)}>{runResult(r)}</td>
                    <td className="py-1.5 pl-3 pr-4 text-right font-mono text-muted-foreground whitespace-nowrap">
                      {r.finishedAt ? `${Math.round((r.finishedAt - r.startedAt) / 1000)}s` : "…"}
                    </td>
                  </tr>
                ))}
                {(runsData?.runs || []).length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No runs yet.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {clusters.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            {status === "suggested"
              ? "No suggestions awaiting review. Run the classifier, then rebuild."
              : status === "pending"
                ? "Nothing pending. Hit “Rebuild queue” to cluster unassigned activity."
                : `No ${status} items.`}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {clusters.map((c) => {
            const fav = c.suggestedProjectId ? faviconUrl(configs[c.suggestedProjectId]) : null;
            const selected = overrides[c.id] ?? (c.suggestedProjectId || "");
            const resolved = c.status === "applied" || c.status === "rejected";
            const icon = appIcon(c.app, c.urlHost);
            return (
              <Card key={c.id}>
                <CardContent className="py-3 px-4 flex items-center gap-3 flex-wrap">
                  {/* App icon */}
                  {icon ? (
                    <Image src={icon} alt="" width={30} height={30} className="shrink-0 rounded-md" unoptimized />
                  ) : (
                    <div className="shrink-0 w-[30px] h-[30px] rounded-md bg-muted" />
                  )}
                  {/* What */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium truncate">
                      <span>{c.app}</span>
                      {c.urlHost && <span className="text-muted-foreground font-normal truncate">· {c.urlHost}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.sampleTitle || c.sampleUrl || "—"}
                    </div>
                  </div>

                  {/* Time / duration — prominent */}
                  <div className="shrink-0 text-right leading-tight">
                    <div className="text-lg font-semibold tabular-nums">{formatMin(c.minutes)}</div>
                    <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {formatDay(c.day)} · {timeRange(c.startTs, c.endTs)}
                    </div>
                  </div>

                  {/* Suggestion / status */}
                  {c.suggestedProjectId && (
                    <div className="text-xs flex items-center gap-1.5 shrink-0">
                      {fav && <Image src={fav} alt="" width={14} height={14} className="rounded-sm" unoptimized />}
                      <span className="font-medium">{projectName(c.suggestedProjectId)}</span>
                      {c.confidence != null && (
                        <span className={`tabular-nums ${c.confidence >= approveThreshold ? "text-green-600" : "text-amber-600"}`}>
                          {Math.round(c.confidence * 100)}%
                        </span>
                      )}
                    </div>
                  )}
                  {c.reason && !resolved && (
                    <div className="text-[11px] text-muted-foreground italic max-w-[200px] truncate shrink-0" title={c.reason}>
                      {c.reason}
                    </div>
                  )}

                  {resolved ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${c.status === "applied" ? "bg-green-500/15 text-green-700" : "bg-muted text-muted-foreground"}`}>
                      {c.status === "applied" ? `→ ${projectName(c.suggestedProjectId) || "assigned"}` : "rejected"}
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <ProjectPicker
                        value={selected}
                        projects={projects}
                        onChange={(v) => setOverrides((o) => ({ ...o, [c.id]: v }))}
                      />
                      <Button variant="default" size="sm" className="h-7 px-2 text-xs"
                        disabled={busy || !selected} onClick={() => decide(c.id, "approve")}>
                        Approve
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                        disabled={busy} onClick={() => decide(c.id, "reject")}>
                        Reject
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
