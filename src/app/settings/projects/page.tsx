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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { useCallback, useMemo, useRef, useState } from "react";
import { useDbQuery } from "@/hooks/use-db";
import type { DbProject } from "@/lib/db";
import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  Loader2,
  Pencil,
  Search,
} from "lucide-react";

type ProjectRow = DbProject;

interface EditForm {
  projectName: string;
  description: string;
  prodUrl: string;
  stagingUrl: string;
  aliases: string;
  linearSlug: string;
  webflowSlug: string;
  neonOrgSlug: string;
  darkColor: string;
  lightColor: string;
}

/** Convert any supported color string (hsl, hex, etc.) to a hex value for the native color input */
function colorToHex(color: string): string {
  if (!color) return "";
  const trimmed = color.trim().toLowerCase();

  // Already hex
  if (trimmed.startsWith("#")) {
    if (trimmed.length === 4) {
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
    }
    return trimmed;
  }

  // HSL
  const hslMatch = trimmed.match(/^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/);
  if (hslMatch) {
    const h = parseInt(hslMatch[1]) / 360;
    const s = parseInt(hslMatch[2]) / 100;
    const l = parseInt(hslMatch[3]) / 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h * 12) % 12;
      const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * c).toString(16).padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  return "";
}

/** Convert hex to HSL string for storing in .tinker.yaml */
function hexToHsl(hex: string): string {
  if (!hex) return "";
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `hsl(0, 0%, ${Math.round(l * 100)}%)`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

export default function ProjectsSettingsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const { data, refetch } = useDbQuery<{ success: boolean; projects: ProjectRow[] }>(
    "/api/db/projects",
    showArchived ? { includeArchived: "true" } : {}
  );
  const projects = data?.projects ?? [];

  const filteredProjects = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return projects;
    return projects.filter((p) =>
      [p.projectName, p.repoName, p.org, p.description, p.aliases, p.linearSlug]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q))
    );
  }, [projects, search]);

  const { data: configsData } = useDbQuery<{
    success: boolean;
    configs: Record<string, { color?: string; darkColor?: string; lightColor?: string; favicon?: string }>;
  }>("/api/project-configs");
  const projectConfigs = configsData?.configs ?? {};

  const [editingProject, setEditingProject] = useState<ProjectRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    projectName: "",
    description: "",
    prodUrl: "",
    stagingUrl: "",
    aliases: "",
    linearSlug: "",
    webflowSlug: "",
    neonOrgSlug: "",
    darkColor: "",
    lightColor: "",
  });
  const [saving, setSaving] = useState(false);

  const openEdit = (project: ProjectRow) => {
    const config = projectConfigs[project.id];
    setEditingProject(project);
    setEditForm({
      projectName: project.projectName,
      description: project.description,
      prodUrl: project.prodUrl,
      stagingUrl: project.stagingUrl,
      aliases: project.aliases,
      linearSlug: project.linearSlug,
      webflowSlug: project.webflowSlug || "",
      neonOrgSlug: project.neonOrgSlug || "",
      darkColor: config?.darkColor ? colorToHex(config.darkColor) : "",
      lightColor: config?.lightColor ? colorToHex(config.lightColor) : "",
    });
  };

  const handleSave = async () => {
    if (!editingProject) return;
    setSaving(true);
    try {
      const { darkColor, lightColor, ...dbFields } = editForm;
      // Save DB fields
      await fetch("/api/db/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: editingProject.id, ...dbFields }),
      });
      // Save colors to .tinker.yaml
      if (darkColor || lightColor) {
        await fetch("/api/project-configs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: editingProject.id,
            darkColor: darkColor ? hexToHsl(darkColor) : undefined,
            lightColor: lightColor ? hexToHsl(lightColor) : undefined,
          }),
        });
      }
      setEditingProject(null);
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = useCallback(async (project: ProjectRow) => {
    const action = project.archived ? "unarchive" : "archive";
    await fetch("/api/db/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id: project.id }),
    });
    refetch();
  }, [refetch]);

  const active = filteredProjects.filter((p) => !p.archived);
  const archived = filteredProjects.filter((p) => p.archived);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/settings">Settings</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Projects</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-[200px] pl-8 text-sm"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? "Hide Archived" : `Show Archived${archived.length > 0 ? ` (${archived.length})` : ""}`}
            </Button>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
          <ProjectTable
            projects={active}
            onEdit={openEdit}
            onArchive={handleArchive}
          />

          {showArchived && archived.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Archived</h3>
              <ProjectTable
                projects={archived}
                onEdit={openEdit}
                onArchive={handleArchive}
                dimmed
              />
            </div>
          )}
        </div>

        <Dialog open={!!editingProject} onOpenChange={(open) => { if (!open) setEditingProject(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Project</DialogTitle>
              <DialogDescription>
                {editingProject?.repoName} — update display name, URLs, and matching slugs.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="projectName">Project Name</Label>
                <Input
                  id="projectName"
                  value={editForm.projectName}
                  onChange={(e) => setEditForm({ ...editForm, projectName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prodUrl">Production URL</Label>
                <Input
                  id="prodUrl"
                  placeholder="https://example.com"
                  value={editForm.prodUrl}
                  onChange={(e) => setEditForm({ ...editForm, prodUrl: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stagingUrl">Staging URL</Label>
                <Input
                  id="stagingUrl"
                  placeholder="https://staging.example.com"
                  value={editForm.stagingUrl}
                  onChange={(e) => setEditForm({ ...editForm, stagingUrl: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="aliases">Aliases</Label>
                <Input
                  id="aliases"
                  placeholder="alias1, alias2"
                  value={editForm.aliases}
                  onChange={(e) => setEditForm({ ...editForm, aliases: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated names used for activity matching (window titles, browser tabs, etc.)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="linearSlug">Linear Slug</Label>
                <Input
                  id="linearSlug"
                  placeholder="my-workspace"
                  value={editForm.linearSlug}
                  onChange={(e) => setEditForm({ ...editForm, linearSlug: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Matches <code>linear.app/&#123;slug&#125;/...</code> browser activity
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="webflowSlug">Webflow Slug</Label>
                <Input
                  id="webflowSlug"
                  placeholder="my-site"
                  value={editForm.webflowSlug}
                  onChange={(e) => setEditForm({ ...editForm, webflowSlug: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Matches <code>&#123;slug&#125;.design.webflow.com</code> and <code>&#123;slug&#125;.webflow.io</code> browser activity
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="neonOrgSlug">Neon Org Slug</Label>
                <Input
                  id="neonOrgSlug"
                  placeholder="my-neon-org"
                  value={editForm.neonOrgSlug}
                  onChange={(e) => setEditForm({ ...editForm, neonOrgSlug: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Free-form identifier — looks up <code>NEON_API_KEY</code> in <code>credentials.yaml</code> under <code>neon_keys</code>.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Terminal Colors</Label>
                <p className="text-xs text-muted-foreground">
                  Background colors for Terminal.app tabs. Saved to <code>.tinker.yaml</code>.
                </p>
                <div className="flex gap-4">
                  <ColorPickerField
                    label="Dark"
                    value={editForm.darkColor}
                    onChange={(v) => setEditForm({ ...editForm, darkColor: v })}
                  />
                  <ColorPickerField
                    label="Light"
                    value={editForm.lightColor}
                    onChange={(v) => setEditForm({ ...editForm, lightColor: v })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingProject(null)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ProjectTable({
  projects,
  onEdit,
  onArchive,
  dimmed,
}: {
  projects: ProjectRow[];
  onEdit: (p: ProjectRow) => void;
  onArchive: (p: ProjectRow) => void;
  dimmed?: boolean;
}) {
  if (projects.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No projects.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Org</TableHead>
          <TableHead>Port</TableHead>
          <TableHead>URLs</TableHead>
          <TableHead>Aliases</TableHead>
          <TableHead>Linear</TableHead>
          <TableHead className="w-[80px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className={dimmed ? "opacity-50" : ""}>
        {projects.map((project) => (
          <TableRow key={project.id}>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">{project.projectName}</span>
                <span className="text-xs text-muted-foreground font-mono">{project.repoName}</span>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{project.org}</Badge>
            </TableCell>
            <TableCell>
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">:{project.port}</code>
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-0.5">
                {project.prodUrl ? (
                  <a
                    href={project.prodUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    prod
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
                {project.stagingUrl && (
                  <a
                    href={project.stagingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    staging
                  </a>
                )}
              </div>
            </TableCell>
            <TableCell>
              {project.aliases ? (
                <div className="flex flex-wrap gap-1">
                  {project.aliases.split(",").map((a) => a.trim()).filter(Boolean).map((alias) => (
                    <Badge key={alias} variant="outline" className="text-xs font-mono">{alias}</Badge>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              {project.linearSlug ? (
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{project.linearSlug}</code>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => onEdit(project)} title="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onArchive(project)}
                  title={project.archived ? "Unarchive" : "Archive"}
                >
                  {project.archived ? (
                    <ArchiveRestore className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Archive className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ColorPickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="h-8 w-8 rounded border border-input shrink-0 cursor-pointer"
        style={{ backgroundColor: value || "#1a1a2e" }}
        onClick={() => inputRef.current?.click()}
        title={`Pick ${label.toLowerCase()} color`}
      />
      <input
        ref={inputRef}
        type="color"
        value={value || "#1a1a2e"}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
      />
      <div className="flex flex-col">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[10px] text-muted-foreground font-mono">
          {value || "not set"}
        </span>
      </div>
    </div>
  );
}
