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
import { useCallback, useState } from "react";
import { useDbQuery } from "@/hooks/use-db";
import type { DbProject } from "@/lib/db";
import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  Loader2,
  Pencil,
} from "lucide-react";

type ProjectRow = DbProject;

interface EditForm {
  projectName: string;
  description: string;
  prodUrl: string;
  stagingUrl: string;
  aliases: string;
  linearSlug: string;
}

export default function ProjectsSettingsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const { data, refetch } = useDbQuery<{ success: boolean; projects: ProjectRow[] }>(
    "/api/db/projects",
    showArchived ? { includeArchived: "true" } : {}
  );
  const projects = data?.projects ?? [];

  const [editingProject, setEditingProject] = useState<ProjectRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    projectName: "",
    description: "",
    prodUrl: "",
    stagingUrl: "",
    aliases: "",
    linearSlug: "",
  });
  const [saving, setSaving] = useState(false);

  const openEdit = (project: ProjectRow) => {
    setEditingProject(project);
    setEditForm({
      projectName: project.projectName,
      description: project.description,
      prodUrl: project.prodUrl,
      stagingUrl: project.stagingUrl,
      aliases: project.aliases,
      linearSlug: project.linearSlug,
    });
  };

  const handleSave = async () => {
    if (!editingProject) return;
    setSaving(true);
    try {
      await fetch("/api/db/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: editingProject.id, ...editForm }),
      });
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

  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

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
          <div className="ml-auto">
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
