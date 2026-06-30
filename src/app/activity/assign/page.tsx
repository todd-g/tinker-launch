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

export default function AssignPage() {
  const [status, setStatus] = useState<string>("suggested");
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const { data: queueData, refetch } = useDbQuery<{ success: boolean; data: Cluster[]; counts: Record<string, number> }>(
    "/api/suggest", { status }
  );
  const { data: projectsData } = useDbQuery<{ success: boolean; projects: ProjectInfo[] }>("/api/db/projects");
  const { data: configsData } = useDbQuery<{ success: boolean; configs: Record<string, ProjectConfig> }>("/api/project-configs");
  const { data: settingsData, refetch: refetchSettings } = useDbQuery<{ success: boolean; autoApproveThreshold: number; autoRejectThreshold: number }>(
    "/api/suggest/settings"
  );

  const runMut = useDbMutation("/api/suggest/run");
  const reviewMut = useDbMutation("/api/suggest/review");
  const settingsMut = useDbMutation("/api/suggest/settings");

  const clusters = useMemo(() => queueData?.data || [], [queueData]);
  const counts = queueData?.counts || {};
  const projects = useMemo(
    () => [...(projectsData?.projects || [])].sort((a, b) => a.projectName.localeCompare(b.projectName)),
    [projectsData]
  );
  const configs = configsData?.configs || {};
  const approveThreshold = settingsData?.autoApproveThreshold ?? 0.9;
  const rejectThreshold = settingsData?.autoRejectThreshold ?? 1.0;

  const projectName = (id: string | null) => id ? (projects.find((p) => p.id === id)?.projectName || id.slice(0, 8)) : null;

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

        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={rebuild} disabled={busy}>
          {busy ? "Working…" : "Rebuild queue"}
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
            return (
              <Card key={c.id}>
                <CardContent className="py-3 px-4 flex items-center gap-4 flex-wrap">
                  {/* What */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium truncate">
                      <span>{c.app}</span>
                      {c.urlHost && <span className="text-muted-foreground font-normal truncate">· {c.urlHost}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.sampleTitle || c.sampleUrl || "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {c.day} · {timeRange(c.startTs, c.endTs)} · {formatMin(c.minutes)}
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
