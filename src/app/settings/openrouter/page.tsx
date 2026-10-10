"use client";

import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Check,
  Link2,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  XCircle,
} from "lucide-react";

// ── Types (mirror GET /api/openrouter) ────────

interface UsageView {
  name: string;
  label: string;
  workspaceId: string;
  today: number;
  month: number;
  total: number;
  limit: number | null;
  limitRemaining: number | null;
  limitReset: string | null;
  disabled: boolean;
  lastUsedAt: string | null;
  createdAt: string | null;
  syncedAt: number;
  missing: boolean;
}

interface ProjectRow {
  id: string;
  repoName: string;
  projectName: string;
  org: string;
  archived: boolean;
  hasLocalPath: boolean;
  orgWorkspaceId: string | null;
  key: {
    hash: string;
    name: string;
    workspaceId: string;
    createdAt: string;
    hasSecret: boolean;
    masked: string | null;
  } | null;
  usage: UsageView | null;
}

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
  linkedProjects: number;
  mappedOrgs: string[];
}

interface RunRow {
  id: number;
  job: string;
  startedAt: number;
  finishedAt: number | null;
  status: "running" | "success" | "error";
  detail: { keysSynced?: number; workspaces?: number; error?: string; message?: string };
}

interface OpenRouterData {
  success: boolean;
  error?: string;
  connected: boolean;
  managementKeyMasked: string | null;
  keyCount: number;
  workspaces: WorkspaceRow[];
  orgWorkspaces: Record<string, string>;
  orgs: string[];
  projects: ProjectRow[];
  unlinkedKeys: Array<UsageView & { hash: string }>;
  lastSync: RunRow | null;
  recentRuns: RunRow[];
}

interface EnvrcResult {
  regenerated: boolean;
  reason?: string;
}

const NOT_MAPPED = "__none__";
const NO_RESET = "none";

// ── Formatting ────────────────────────────────

function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n > 0 && n < 0.005) return "<$0.01";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtAgo(when: string | number | null | undefined, now: number): string {
  if (when === null || when === undefined || when === "") return "Never";
  const t = typeof when === "number" ? when : Date.parse(when);
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 60) return `${d}d ago`;
  return new Date(t).toLocaleDateString();
}

function fmtDate(when: string | null | undefined): string {
  if (!when) return "—";
  const t = Date.parse(when);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString() : "—";
}

function fmtWhen(ts: number): string {
  return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtLimit(limit: number | null | undefined, reset: string | null | undefined): string {
  if (limit === null || limit === undefined) return "—";
  const per = reset === "daily" ? "day" : reset === "weekly" ? "week" : reset === "monthly" ? "month" : null;
  return per ? `${fmtUsd(limit)} / ${per}` : fmtUsd(limit);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}

function runResult(r: RunRow): string {
  if (r.status === "running") return "Running…";
  if (r.detail.error) return r.detail.error;
  if (typeof r.detail.keysSynced === "number") {
    return `${r.detail.keysSynced} keys${typeof r.detail.workspaces === "number" ? ` · ${r.detail.workspaces} workspaces` : ""}`;
  }
  return r.detail.message ?? "";
}

/** OpenRouter is Minima-only: a project belongs here if its org is mapped, or it already holds a key. */
function eligible(p: ProjectRow): boolean {
  return !!p.orgWorkspaceId || !!p.key;
}

function Muted({ children = "—" }: { children?: React.ReactNode }) {
  return <span className="text-xs text-muted-foreground">{children}</span>;
}

// ── Page ──────────────────────────────────────

export default function OpenRouterSettingsPage() {
  const [data, setData] = useState<OpenRouterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // action in flight
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [showAll, setShowAll] = useState(false);

  // Management key
  const [mgmtKeyInput, setMgmtKeyInput] = useState("");

  // New workspace dialog
  const [wsDialogOpen, setWsDialogOpen] = useState(false);
  const [wsForm, setWsForm] = useState({ name: "", slug: "", description: "", slugTouched: false });

  // Create key dialog
  const [createFor, setCreateFor] = useState<ProjectRow | null>(null);
  const [createForm, setCreateForm] = useState({ workspaceId: "", limit: "", limitReset: NO_RESET });

  // One-time plaintext key reveal
  const [createdKey, setCreatedKey] = useState<{ repoName: string; key: string; envrc: EnvrcResult } | null>(null);
  const [copied, setCopied] = useState(false);

  // Edit limit dialog
  const [editFor, setEditFor] = useState<ProjectRow | null>(null);
  const [editForm, setEditForm] = useState({ limit: "", limitReset: NO_RESET });

  // Link dialog (from a project row, or from an unlinked key row)
  const [linkDialog, setLinkDialog] = useState<{ repoName: string; hash: string } | null>(null);

  // Confirm dialog
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    destructive?: boolean;
    run: () => Promise<void>;
  } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/openrouter");
      const json = (await res.json()) as OpenRouterData;
      if (json.success) setData(json);
      else setNotice({ type: "error", text: json.error || "Failed to load OpenRouter data" });
    } catch (e) {
      setNotice({ type: "error", text: e instanceof Error ? e.message : "Failed to load OpenRouter data" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  /** POST an action; on failure show the error and return null. Always refetches. */
  const post = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(action);
    setNotice(null);
    try {
      const res = await fetch("/api/openrouter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await res.json();
      if (!json.success) {
        setNotice({ type: "error", text: json.error || `${action} failed` });
        return null;
      }
      return json;
    } catch (e) {
      setNotice({ type: "error", text: e instanceof Error ? e.message : `${action} failed` });
      return null;
    } finally {
      setBusy(null);
      await fetchData();
    }
  }, [fetchData]);

  const workspaceName = useMemo(() => {
    const map = new Map((data?.workspaces ?? []).map((w) => [w.id, w.name]));
    return (id: string | null | undefined) => {
      if (!id) return null;
      return map.get(id) ?? `${id.slice(0, 8)}…`;
    };
  }, [data?.workspaces]);

  const allProjects = useMemo(() => data?.projects ?? [], [data?.projects]);
  const visibleProjects = useMemo(() => {
    const rows = showAll ? allProjects : allProjects.filter(eligible);
    return [...rows].sort((a, b) =>
      Number(eligible(b)) - Number(eligible(a)) || a.projectName.localeCompare(b.projectName)
    );
  }, [allProjects, showAll]);
  const hiddenCount = allProjects.filter((p) => !eligible(p)).length;
  const linkableProjects = allProjects.filter((p) => !p.key && !!p.orgWorkspaceId);

  // ── Handlers ────────────────────────────────

  const handleSetManagementKey = async () => {
    const r = await post("setManagementKey", { key: mgmtKeyInput });
    if (r) {
      setMgmtKeyInput("");
      setNotice({ type: "success", text: `Connected — ${r.workspaces} workspace${r.workspaces === 1 ? "" : "s"} found` });
    }
  };

  const handleCreateWorkspace = async () => {
    const r = await post("createWorkspace", { name: wsForm.name, slug: wsForm.slug, description: wsForm.description });
    if (r) {
      setWsDialogOpen(false);
      setWsForm({ name: "", slug: "", description: "", slugTouched: false });
    }
  };

  const openCreateKey = (p: ProjectRow) => {
    setCreateFor(p);
    setCreateForm({ workspaceId: p.orgWorkspaceId ?? "", limit: "", limitReset: NO_RESET });
  };

  const handleCreateKey = async () => {
    if (!createFor) return;
    const limit = createForm.limit.trim() === "" ? null : Number(createForm.limit);
    const r = await post("createProjectKey", {
      repoName: createFor.repoName,
      workspaceId: createForm.workspaceId,
      limit,
      limitReset: limit === null || createForm.limitReset === NO_RESET ? null : createForm.limitReset,
    });
    if (r) {
      setCreatedKey({ repoName: createFor.repoName, key: r.key, envrc: r.envrc });
      setCopied(false);
      setCreateFor(null);
    }
  };

  const openEditLimit = (p: ProjectRow) => {
    setEditFor(p);
    setEditForm({
      limit: p.usage?.limit !== null && p.usage?.limit !== undefined ? String(p.usage.limit) : "",
      limitReset: p.usage?.limitReset ?? NO_RESET,
    });
  };

  const handleEditLimit = async () => {
    if (!editFor) return;
    const limit = editForm.limit.trim() === "" ? null : Number(editForm.limit);
    const r = await post("updateProjectKey", {
      repoName: editFor.repoName,
      limit,
      limitReset: limit === null || editForm.limitReset === NO_RESET ? null : editForm.limitReset,
    });
    if (r) setEditFor(null);
  };

  const handleLink = async () => {
    if (!linkDialog?.repoName || !linkDialog.hash) return;
    const r = await post("linkExistingKey", linkDialog);
    if (r) setLinkDialog(null);
  };

  const askUnlink = (p: ProjectRow) => setConfirm({
    title: `Unlink key from ${p.projectName}?`,
    description: p.key?.hasSecret
      ? "Removes the key from credentials.yaml and OPENROUTER_API_KEY from the project's .envrc. The key keeps working on OpenRouter and will show under Unlinked keys."
      : "Stops tracking this key against the project. The key itself is untouched on OpenRouter.",
    confirmLabel: "Unlink",
    run: async () => {
      const r = await post("unlinkProjectKey", { repoName: p.repoName });
      if (r) setNotice({ type: "success", text: `Unlinked ${p.repoName}` });
    },
  });

  const askRevoke = (p: ProjectRow) => setConfirm({
    title: `Revoke ${p.projectName}'s key?`,
    description: "Deletes the key on OpenRouter — anything using it (local .envrc, Convex, Vercel) stops working immediately. Usage history stays in Tinker Launch. This can't be undone.",
    confirmLabel: "Revoke key",
    destructive: true,
    run: async () => {
      const r = await post("revokeProjectKey", { repoName: p.repoName });
      if (r) setNotice({ type: "success", text: `Revoked ${p.repoName}'s key${r.envrc?.regenerated ? " — .envrc updated" : ""}` });
    },
  });

  const askRemoveManagementKey = () => setConfirm({
    title: "Remove management key?",
    description: "Tinker Launch stops syncing usage and can't create or revoke keys until you add one again. Project keys and usage history are kept.",
    confirmLabel: "Remove",
    destructive: true,
    run: async () => { await post("removeManagementKey"); },
  });

  const copyKey = async () => {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey.key);
      setCopied(true);
    } catch {
      setNotice({ type: "error", text: "Copy failed — select the key and copy it manually" });
    }
  };

  // ── Render ──────────────────────────────────

  const shell = (children: React.ReactNode, headerRight?: React.ReactNode) => (
    <SidebarProvider>
      <AppSidebar />
      {/* min-w-0: wide tables scroll inside their cards instead of widening the page */}
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/settings">Settings</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>OpenRouter</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          {headerRight}
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );

  if (loading) {
    return shell(
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const connected = !!data?.connected;
  const lastSyncAt = data?.lastSync ? (data.lastSync.finishedAt ?? data.lastSync.startedAt) : null;

  const headerRight = connected ? (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground">
        {lastSyncAt ? `Last synced ${fmtAgo(lastSyncAt, now)}` : "Never synced"}
      </span>
      <Button variant="outline" size="sm" onClick={() => post("sync")} disabled={busy !== null}>
        <RefreshCw className={`h-4 w-4 mr-1 ${busy === "sync" ? "animate-spin" : ""}`} />
        Sync usage
      </Button>
    </div>
  ) : undefined;

  return shell(
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <p className="text-sm text-muted-foreground">
        One OpenRouter key per project, grouped into a workspace per paying entity so each client&apos;s
        spend can be filtered and rebilled. Keys land in each project&apos;s <code>.envrc</code> as{" "}
        <code>OPENROUTER_API_KEY</code>. See the{" "}
        <a href="/docs#openrouter" className="text-primary hover:underline">guide</a>.
      </p>

      {notice && (
        <div
          className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
            notice.type === "error"
              ? "border-destructive/50 bg-destructive/5 text-destructive"
              : "border-green-600/40 bg-green-600/5 text-green-700 dark:text-green-400"
          }`}
        >
          <span>{notice.text}</span>
          <button className="text-xs opacity-70 hover:opacity-100" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {/* ── Management key ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Management key</CardTitle>
              <CardDescription>
                Lets Tinker Launch create, list, and revoke keys and read their usage. It can&apos;t run
                inference. Create one at openrouter.ai → Settings → Management keys.
              </CardDescription>
            </div>
            {connected ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="text-green-600" /> Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <XCircle /> Not connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {connected && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{data?.managementKeyMasked}</code>
              <span className="text-muted-foreground">
                {data?.workspaces.length ?? 0} workspace{data?.workspaces.length === 1 ? "" : "s"} · {data?.keyCount ?? 0} key{data?.keyCount === 1 ? "" : "s"}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 max-w-xl">
            <Input
              type="password"
              placeholder={connected ? "Paste a new management key to replace" : "sk-or-v1-…"}
              value={mgmtKeyInput}
              onChange={(e) => setMgmtKeyInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && mgmtKeyInput.trim()) handleSetManagementKey(); }}
            />
            <Button onClick={handleSetManagementKey} disabled={!mgmtKeyInput.trim() || busy !== null}>
              {busy === "setManagementKey" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {connected ? "Replace" : "Connect"}
            </Button>
            {connected && (
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={askRemoveManagementKey} disabled={busy !== null}>
                Remove
              </Button>
            )}
          </div>
          {!connected && (
            <p className="text-xs text-muted-foreground">
              The key is validated against OpenRouter before it&apos;s saved to <code>~/.tinker-launch/credentials.yaml</code>.
            </p>
          )}
        </CardContent>
      </Card>

      {connected && data && (
        <>
          {/* ── Workspaces ── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>Workspaces</CardTitle>
                  <CardDescription>
                    One workspace per paying entity. Only orgs mapped to a workspace can hold OpenRouter keys;
                    the mapping is also the default workspace for new keys.
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setWsDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  New workspace
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Mapped orgs</TableHead>
                    <TableHead className="text-right">Linked projects</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.workspaces.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell>
                        <div className="font-medium">{w.name}</div>
                        {w.description && <div className="text-xs text-muted-foreground">{w.description}</div>}
                      </TableCell>
                      <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{w.slug}</code></TableCell>
                      <TableCell>
                        {w.mappedOrgs.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {w.mappedOrgs.map((o) => <Badge key={o} variant="outline" className="font-mono">{o}</Badge>)}
                          </div>
                        ) : <Muted />}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{w.linkedProjects}</TableCell>
                    </TableRow>
                  ))}
                  {data.workspaces.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                        No workspaces yet — sync, or create one.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Org → workspace</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Org</TableHead>
                      <TableHead>Workspace</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.orgs.map((org) => {
                      const mapped = data.orgWorkspaces[org];
                      return (
                        <TableRow key={org}>
                          <TableCell className={`font-mono text-sm ${mapped ? "" : "text-muted-foreground"}`}>{org}</TableCell>
                          <TableCell>
                            <Select
                              value={mapped ?? NOT_MAPPED}
                              onValueChange={(v) => post("mapOrgWorkspace", { org, workspaceId: v === NOT_MAPPED ? null : v })}
                              disabled={busy !== null}
                            >
                              <SelectTrigger size="sm" className={`w-64 ${mapped ? "" : "text-muted-foreground"}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NOT_MAPPED}>— Not in OpenRouter —</SelectItem>
                                {data.workspaces.map((w) => (
                                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                                ))}
                                {mapped && !data.workspaces.some((w) => w.id === mapped) && (
                                  <SelectItem value={mapped}>{workspaceName(mapped)}</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* ── Project keys ── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>Project keys</CardTitle>
                  <CardDescription>
                    Projects in mapped orgs. Usage is per key; today/month reset on UTC boundaries.
                  </CardDescription>
                </div>
                {hiddenCount > 0 && (
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowAll((s) => !s)}>
                    {showAll ? "Hide unmapped orgs" : `Show all projects (${hiddenCount} more)`}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Org</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Limit</TableHead>
                    <TableHead className="text-right">Today</TableHead>
                    <TableHead className="text-right">This month</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead className="w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleProjects.map((p) => {
                    const isEligible = eligible(p);
                    const u = p.usage;
                    return (
                      <TableRow key={p.id} className={isEligible ? "" : "opacity-50"}>
                        <TableCell>
                          <div className="font-medium">{p.projectName}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.repoName}{p.archived ? " · archived" : ""}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{p.org}</TableCell>
                        <TableCell className="text-sm">
                          {p.key ? (workspaceName(p.key.workspaceId) ?? <Muted />) : p.orgWorkspaceId ? (
                            <span className="text-muted-foreground">{workspaceName(p.orgWorkspaceId)}</span>
                          ) : <Muted>Not mapped</Muted>}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            {!p.key ? (
                              <Muted>None</Muted>
                            ) : p.key.hasSecret ? (
                              <Badge variant="secondary">Key</Badge>
                            ) : (
                              <Badge variant="outline">Tracking only</Badge>
                            )}
                            {u?.disabled && <Badge variant="outline" className="text-yellow-600">Disabled</Badge>}
                            {u?.missing && <Badge variant="outline" className="text-destructive">Missing</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {u ? fmtLimit(u.limit, u.limitReset) : <Muted />}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{u ? fmtUsd(u.today) : <Muted />}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{u ? fmtUsd(u.month) : <Muted />}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{u ? fmtUsd(u.total) : <Muted />}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {p.key ? fmtAgo(u?.lastUsedAt, now) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!p.key && (
                              p.orgWorkspaceId ? (
                                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => openCreateKey(p)} disabled={busy !== null}>
                                  Create key
                                </Button>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span tabIndex={0}>
                                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled>
                                        Create key
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>Org not mapped to an OpenRouter workspace</TooltipContent>
                                </Tooltip>
                              )
                            )}
                            {(p.key || p.orgWorkspaceId) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={busy !== null} aria-label={`Key actions for ${p.projectName}`}>
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {p.key ? (
                                    <>
                                      <DropdownMenuItem onClick={() => openEditLimit(p)}>Edit limit</DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => post("updateProjectKey", { repoName: p.repoName, disabled: !u?.disabled })}>
                                        {u?.disabled ? "Enable key" : "Disable key"}
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onClick={() => askUnlink(p)}>Unlink</DropdownMenuItem>
                                      <DropdownMenuItem variant="destructive" onClick={() => askRevoke(p)}>Revoke…</DropdownMenuItem>
                                    </>
                                  ) : (
                                    <DropdownMenuItem
                                      disabled={data.unlinkedKeys.length === 0}
                                      onClick={() => setLinkDialog({ repoName: p.repoName, hash: "" })}
                                    >
                                      <Link2 /> Link existing key…
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {visibleProjects.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="py-6 text-center text-sm text-muted-foreground">
                        No projects in mapped orgs. Map an org to a workspace above.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ── Unlinked keys ── */}
          <Card>
            <CardHeader>
              <CardTitle>Unlinked keys</CardTitle>
              <CardDescription>Keys on the OpenRouter account that aren&apos;t attached to a project.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead className="text-right">This month</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[140px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.unlinkedKeys.map((k) => (
                    <TableRow key={k.hash}>
                      <TableCell>
                        <div className="font-medium">{k.name || <Muted>(unnamed)</Muted>}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {k.label}{k.disabled ? " · disabled" : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{workspaceName(k.workspaceId) ?? <Muted />}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{fmtUsd(k.month)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{fmtUsd(k.total)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtDate(k.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setLinkDialog({ repoName: "", hash: k.hash })}
                          disabled={busy !== null || linkableProjects.length === 0}
                        >
                          Link to project
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data.unlinkedKeys.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                        Every key on the account is linked to a project.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Sync runs ── */}
      {data && connected && (
        <Card>
          <CardHeader>
            <CardTitle>Sync runs</CardTitle>
            <CardDescription>
              Each sync lists every key and stores one usage snapshot per key per UTC day. Runs automatically
              when this page loads and the last sync is over 10 minutes old.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentRuns.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm whitespace-nowrap">{fmtWhen(r.startedAt)}</TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">
                      {r.finishedAt ? `${((r.finishedAt - r.startedAt) / 1000).toFixed(1)}s` : "…"}
                    </TableCell>
                    <TableCell>
                      {r.status === "success" ? (
                        <Badge variant="secondary" className="text-green-600">success</Badge>
                      ) : r.status === "error" ? (
                        <Badge variant="outline" className="text-destructive">error</Badge>
                      ) : (
                        <Badge variant="outline" className="text-yellow-600">running</Badge>
                      )}
                    </TableCell>
                    <TableCell
                      className={`text-sm truncate max-w-[480px] ${r.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
                      title={runResult(r)}
                    >
                      {runResult(r)}
                    </TableCell>
                  </TableRow>
                ))}
                {data.recentRuns.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">No runs yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── New workspace dialog ── */}
      <Dialog open={wsDialogOpen} onOpenChange={setWsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>One workspace per paying entity (org or client).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ws-name">Name</Label>
              <Input
                id="ws-name"
                placeholder="e.g., Minima"
                value={wsForm.name}
                onChange={(e) => setWsForm((f) => ({ ...f, name: e.target.value, slug: f.slugTouched ? f.slug : slugify(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-slug">Slug</Label>
              <Input
                id="ws-slug"
                className="font-mono"
                value={wsForm.slug}
                onChange={(e) => setWsForm((f) => ({ ...f, slug: e.target.value, slugTouched: true }))}
              />
              <p className="text-xs text-muted-foreground">Lowercase letters and numbers, single hyphens.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-desc">Description (optional)</Label>
              <Input
                id="ws-desc"
                value={wsForm.description}
                onChange={(e) => setWsForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateWorkspace} disabled={!wsForm.name.trim() || !wsForm.slug || busy !== null}>
              {busy === "createWorkspace" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create key dialog ── */}
      <Dialog open={!!createFor} onOpenChange={(open) => { if (!open) setCreateFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create key — {createFor?.projectName}</DialogTitle>
            <DialogDescription>
              Named <code>{createFor?.repoName}</code> on OpenRouter. Saved to credentials.yaml and written to the
              project&apos;s <code>.envrc</code> as <code>OPENROUTER_API_KEY</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Workspace</Label>
              <Select value={createForm.workspaceId} onValueChange={(v) => setCreateForm((f) => ({ ...f, workspaceId: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select a workspace" /></SelectTrigger>
                <SelectContent>
                  {(data?.workspaces ?? []).map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}{w.id === createFor?.orgWorkspaceId ? " (org default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="key-limit">Limit (USD, optional)</Label>
                <Input
                  id="key-limit"
                  type="number"
                  min={0}
                  step="1"
                  placeholder="No limit"
                  value={createForm.limit}
                  onChange={(e) => setCreateForm((f) => ({ ...f, limit: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Resets</Label>
                <Select
                  value={createForm.limitReset}
                  onValueChange={(v) => setCreateForm((f) => ({ ...f, limitReset: v }))}
                  disabled={createForm.limit.trim() === ""}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_RESET}>Never</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateFor(null)}>Cancel</Button>
            <Button onClick={handleCreateKey} disabled={!createForm.workspaceId || busy !== null}>
              {busy === "createProjectKey" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── One-time key reveal ── */}
      <Dialog open={!!createdKey} onOpenChange={(open) => { if (!open) { setCreatedKey(null); setCopied(false); } }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Key created — {createdKey?.repoName}</DialogTitle>
            <DialogDescription>
              OpenRouter shows the secret only once. It&apos;s saved in credentials.yaml; copy it now if you need it elsewhere.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <Input readOnly value={createdKey?.key ?? ""} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button variant="outline" size="sm" onClick={copyKey}>
                {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-sm">
              {createdKey?.envrc.regenerated ? (
                <span className="text-green-600">.envrc updated with OPENROUTER_API_KEY.</span>
              ) : (
                <span className="text-yellow-600">.envrc not updated: {createdKey?.envrc.reason ?? "unknown reason"}.</span>
              )}
            </p>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                Push it only to the runtime that calls the model, from the project folder. Each command loads the
                fresh <code className="font-mono text-xs">.envrc</code> itself — direnv blocks a changed file until{" "}
                <code className="font-mono text-xs">direnv allow</code>, and a blank value pushes without any error.
              </p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono">{`# Convex actions call the model (add --prod for production):
bash -c 'source .envrc && npx convex env set OPENROUTER_API_KEY "$OPENROUTER_API_KEY"'

# Vercel functions call the model:
bash -c 'source .envrc && printf %s "$OPENROUTER_API_KEY" | vercel env add OPENROUTER_API_KEY production'

# Local Next.js server only: run \`direnv allow\`, then start it from a new prompt`}</pre>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => { setCreatedKey(null); setCopied(false); }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit limit dialog ── */}
      <Dialog open={!!editFor} onOpenChange={(open) => { if (!open) setEditFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit limit — {editFor?.projectName}</DialogTitle>
            <DialogDescription>Leave the limit empty to remove it.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-limit">Limit (USD)</Label>
              <Input
                id="edit-limit"
                type="number"
                min={0}
                step="1"
                placeholder="No limit"
                value={editForm.limit}
                onChange={(e) => setEditForm((f) => ({ ...f, limit: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Resets</Label>
              <Select
                value={editForm.limitReset}
                onValueChange={(v) => setEditForm((f) => ({ ...f, limitReset: v }))}
                disabled={editForm.limit.trim() === ""}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_RESET}>Never</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditFor(null)}>Cancel</Button>
            <Button onClick={handleEditLimit} disabled={busy !== null}>
              {busy === "updateProjectKey" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Link dialog ── */}
      <Dialog open={!!linkDialog} onOpenChange={(open) => { if (!open) setLinkDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link existing key</DialogTitle>
            <DialogDescription>
              Tracks an existing key&apos;s usage against a project. Tinker Launch never sees its secret, so
              the project&apos;s <code>.envrc</code> is not changed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={linkDialog?.repoName || undefined} onValueChange={(v) => setLinkDialog((d) => d && { ...d, repoName: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select a project" /></SelectTrigger>
                <SelectContent>
                  {linkableProjects.map((p) => (
                    <SelectItem key={p.repoName} value={p.repoName}>{p.projectName} ({p.repoName})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Key</Label>
              <Select value={linkDialog?.hash || undefined} onValueChange={(v) => setLinkDialog((d) => d && { ...d, hash: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select a key" /></SelectTrigger>
                <SelectContent>
                  {(data?.unlinkedKeys ?? []).map((k) => (
                    <SelectItem key={k.hash} value={k.hash}>
                      {k.name || "(unnamed)"} · {k.label} · {workspaceName(k.workspaceId) ?? "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialog(null)}>Cancel</Button>
            <Button onClick={handleLink} disabled={!linkDialog?.repoName || !linkDialog?.hash || busy !== null}>
              {busy === "linkExistingKey" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm dialog ── */}
      <Dialog open={!!confirm} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm?.title}</DialogTitle>
            <DialogDescription>{confirm?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              variant={confirm?.destructive ? "destructive" : "default"}
              disabled={busy !== null}
              onClick={async () => {
                const c = confirm;
                if (!c) return;
                await c.run();
                setConfirm(null);
              }}
            >
              {busy !== null && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {confirm?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>,
    headerRight
  );
}
