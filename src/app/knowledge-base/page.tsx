"use client";

import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
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
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMemo, useState } from "react";
import { useDbQuery, useDbMutation } from "@/hooks/use-db";
import {
  BookOpen,
  GitBranch,
  Lightbulb,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

interface DbProject {
  id: string;
  projectName: string;
}

interface KBEntry {
  id: string;
  type: "decision" | "pattern" | "learning";
  title: string;
  content: string;
  tags: string;
  projectId: string | null;
  createdAt: number;
  updatedAt: number;
}

type TypeFilter = "all" | "decision" | "pattern" | "learning";

const TYPE_ICONS = {
  decision: GitBranch,
  pattern: BookOpen,
  learning: Lightbulb,
};

const TYPE_COLORS = {
  decision: "text-blue-500",
  pattern: "text-green-500",
  learning: "text-amber-500",
};

interface EntryForm {
  type: "decision" | "pattern" | "learning";
  title: string;
  content: string;
  tags: string;
  projectId: string;
}

const emptyForm: EntryForm = {
  type: "decision",
  title: "",
  content: "",
  tags: "",
  projectId: "",
};

export default function KnowledgeBasePage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [editing, setEditing] = useState<KBEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<EntryForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<KBEntry | null>(null);

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (typeFilter !== "all") p.type = typeFilter;
    if (search) p.search = search;
    return p;
  }, [typeFilter, search]);

  const { data, loading, refetch } = useDbQuery<{
    success: boolean;
    entries: KBEntry[];
    count: number;
  }>("/api/db/knowledge-base", params);

  const { data: projectsData } = useDbQuery<{
    success: boolean;
    projects: DbProject[];
  }>("/api/db/projects");

  const { mutate } = useDbMutation("/api/db/knowledge-base");
  const entries = data?.entries ?? [];
  const projectsList = projectsData?.projects ?? [];
  const projectMap = useMemo(
    () => new Map(projectsList.map((p) => [p.id, p.projectName])),
    [projectsList]
  );

  const openCreate = () => {
    setForm(emptyForm);
    setCreating(true);
  };

  const openEdit = (entry: KBEntry) => {
    setEditing(entry);
    setForm({
      type: entry.type,
      title: entry.title,
      content: entry.content,
      tags: entry.tags,
      projectId: entry.projectId || "",
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (creating) {
        await mutate({
          action: "create",
          data: {
            type: form.type,
            title: form.title,
            content: form.content,
            tags: form.tags,
            projectId: form.projectId || undefined,
          },
        });
        setCreating(false);
      } else if (editing) {
        await mutate({
          action: "update",
          id: editing.id,
          data: {
            type: form.type,
            title: form.title,
            content: form.content,
            tags: form.tags,
            projectId: form.projectId || null,
          },
        });
        setEditing(null);
      }
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      await mutate({ action: "remove", id: deleting.id });
      setDeleting(null);
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const typeCounts = useMemo(() => {
    const all = data?.entries ?? [];
    return {
      decision: all.filter((e) => e.type === "decision").length,
      pattern: all.filter((e) => e.type === "pattern").length,
      learning: all.filter((e) => e.type === "learning").length,
    };
  }, [data]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Knowledge Base</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-[200px] pl-8 text-sm"
              />
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              New Entry
            </Button>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {/* Type filters */}
          <div className="flex gap-1">
            <Button
              variant={typeFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setTypeFilter("all")}
              className="text-xs"
            >
              All ({entries.length})
            </Button>
            {(["decision", "pattern", "learning"] as const).map((t) => {
              const Icon = TYPE_ICONS[t];
              return (
                <Button
                  key={t}
                  variant={typeFilter === t ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTypeFilter(t)}
                  className="text-xs capitalize gap-1"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t}s ({typeCounts[t]})
                </Button>
              );
            })}
          </div>

          {/* Entries */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {search
                  ? "No entries match your search."
                  : "No knowledge base entries yet. Start capturing decisions, patterns, and learnings."}
              </p>
              {!search && (
                <Button size="sm" className="mt-3" onClick={openCreate}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Create First Entry
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {entries.map((entry) => {
                const Icon = TYPE_ICONS[entry.type];
                return (
                  <Card key={entry.id} className="group">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Icon
                            className={`h-4 w-4 ${TYPE_COLORS[entry.type]}`}
                          />
                          <CardTitle className="text-sm font-medium">
                            {entry.title}
                          </CardTitle>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEdit(entry)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setDeleting(entry)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
                        {entry.content}
                      </p>
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] capitalize">
                          {entry.type}
                        </Badge>
                        {entry.projectId && projectMap.get(entry.projectId) && (
                          <Badge variant="outline" className="text-[10px]">
                            {projectMap.get(entry.projectId)}
                          </Badge>
                        )}
                        {entry.tags &&
                          entry.tags
                            .split(",")
                            .map((t) => t.trim())
                            .filter(Boolean)
                            .map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="text-[10px] font-mono"
                              >
                                {tag}
                              </Badge>
                            ))}
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {formatDate(entry.updatedAt)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Create/Edit Dialog */}
        <Dialog
          open={creating || !!editing}
          onOpenChange={(open) => {
            if (!open) {
              setCreating(false);
              setEditing(null);
            }
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {creating ? "New Entry" : `Edit: ${editing?.title}`}
              </DialogTitle>
              <DialogDescription>
                {creating
                  ? "Capture a decision, pattern, or learning."
                  : "Update this knowledge base entry."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        type: v as "decision" | "pattern" | "learning",
                      })
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="decision">Decision</SelectItem>
                      <SelectItem value="pattern">Pattern</SelectItem>
                      <SelectItem value="learning">Learning</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Project (optional)</Label>
                  <Select
                    value={form.projectId || "none"}
                    onValueChange={(v) =>
                      setForm({ ...form, projectId: v === "none" ? "" : v })
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Cross-project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Cross-project</SelectItem>
                      {projectsList.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.projectName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kb-title" className="text-xs">
                  Title
                </Label>
                <Input
                  id="kb-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g., Use Linear GraphQL API instead of MCP"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kb-content" className="text-xs">
                  Content
                </Label>
                <Textarea
                  id="kb-content"
                  value={form.content}
                  onChange={(e) =>
                    setForm({ ...form, content: e.target.value })
                  }
                  placeholder="What was decided/learned and why..."
                  className="text-sm min-h-[150px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kb-tags" className="text-xs">
                  Tags
                </Label>
                <Input
                  id="kb-tags"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="api, architecture, testing"
                  className="h-8 text-sm font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setCreating(false);
                  setEditing(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !form.title || !form.content}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {creating ? "Create" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog
          open={!!deleting}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete &quot;{deleting?.title}&quot;?</DialogTitle>
              <DialogDescription>
                This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={saving}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
