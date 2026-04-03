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
import { Textarea } from "@/components/ui/textarea";
import { useCallback, useMemo, useState } from "react";
import { useDbQuery, useDbMutation } from "@/hooks/use-db";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Eye,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";

interface SkillFrontmatter {
  name?: string;
  description?: string;
  "disable-model-invocation"?: boolean;
  "user-invocable"?: boolean;
  "allowed-tools"?: string | string[];
  model?: string;
  effort?: string;
  context?: string;
  agent?: string;
  paths?: string | string[];
  "argument-hint"?: string;
  shell?: string;
}

interface ScannedSkill {
  id: string;
  name: string;
  description: string;
  filePath: string;
  scope: "personal" | "project";
  type: "skill" | "command";
  projectId: string | null;
  projectName: string | null;
  projectPath: string | null;
  frontmatter: SkillFrontmatter;
  content: string;
  lastModified: number;
  fileSize: number;
}

type ScopeFilter = "all" | "personal" | "project";
type TypeFilter = "all" | "skill" | "command";

export default function SkillsRegistryPage() {
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [viewing, setViewing] = useState<ScannedSkill | null>(null);
  const [editing, setEditing] = useState<ScannedSkill | null>(null);
  const [editFm, setEditFm] = useState<SkillFrontmatter>({});
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ScannedSkill | null>(null);

  // Migration state
  const [migrating, setMigrating] = useState<ScannedSkill | null>(null);
  const [migrateDesc, setMigrateDesc] = useState("");
  const [migrateDisableModel, setMigrateDisableModel] = useState(false);
  const [migrateResult, setMigrateResult] = useState<{
    success: boolean;
    name: string;
    newPath: string;
    warnings: string[];
    addedDisableModelInvocation: boolean;
  } | null>(null);
  const [bulkMigrating, setBulkMigrating] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    migratedCount: number;
    errorCount: number;
    migrated: { name: string; warnings: string[]; addedDisableModelInvocation: boolean }[];
    errors: { filePath: string; error: string }[];
  } | null>(null);

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (scopeFilter !== "all") p.scope = scopeFilter;
    if (typeFilter !== "all") p.type = typeFilter;
    return p;
  }, [scopeFilter, typeFilter]);

  const { data, loading, refetch } = useDbQuery<{
    success: boolean;
    skills: ScannedSkill[];
    count: number;
  }>("/api/skills", params);

  const { mutate } = useDbMutation("/api/skills");

  const skills = data?.skills ?? [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return skills;
    return skills.filter((s) =>
      [s.name, s.description, s.projectName, s.filePath]
        .filter(Boolean)
        .some((f) => f!.toLowerCase().includes(q))
    );
  }, [skills, search]);

  const openEdit = (skill: ScannedSkill) => {
    setEditing(skill);
    setEditFm(skill.frontmatter);
    setEditContent(skill.content);
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await mutate({
        action: "update",
        filePath: editing.filePath,
        frontmatter: editFm,
        content: editContent,
      });
      setEditing(null);
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      await mutate({ action: "delete", filePath: deleting.filePath });
      setDeleting(null);
      setViewing(null);
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const openMigrate = (skill: ScannedSkill) => {
    setMigrating(skill);
    setMigrateDesc(skill.description || "");
    setMigrateDisableModel(false);
    setMigrateResult(null);
  };

  const handleMigrate = async () => {
    if (!migrating) return;
    setSaving(true);
    try {
      const res = await mutate({
        action: "migrate",
        filePath: migrating.filePath,
        disableModelInvocation: migrateDisableModel || undefined,
        description: migrateDesc || undefined,
      });
      if (res.success) {
        setMigrateResult(res.migration);
        refetch();
      }
    } finally {
      setSaving(false);
    }
  };

  const commands = filtered.filter((s) => s.type === "command");

  const handleBulkMigrate = async () => {
    setBulkMigrating(true);
    setSaving(true);
    try {
      const filePaths = commands.map((c) => c.filePath);
      const res = await mutate({
        action: "migrateBulk",
        filePaths,
      });
      if (res.success) {
        setBulkResult(res);
        refetch();
      }
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

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
                <BreadcrumbPage>Skills Registry</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search skills..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-[200px] pl-8 text-sm"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              title="Rescan"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" asChild>
              <Link href="/skills/new">
                <Plus className="h-3.5 w-3.5 mr-1" />
                New Skill
              </Link>
            </Button>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {/* Filters */}
          <div className="flex gap-2">
            <div className="flex gap-1">
              {(["all", "personal", "project"] as ScopeFilter[]).map((s) => (
                <Button
                  key={s}
                  variant={scopeFilter === s ? "default" : "outline"}
                  size="sm"
                  onClick={() => setScopeFilter(s)}
                  className="text-xs capitalize"
                >
                  {s}
                </Button>
              ))}
            </div>
            <Separator orientation="vertical" className="data-[orientation=vertical]:h-6 self-center" />
            <div className="flex gap-1">
              {(["all", "skill", "command"] as TypeFilter[]).map((t) => (
                <Button
                  key={t}
                  variant={typeFilter === t ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTypeFilter(t)}
                  className="text-xs capitalize"
                >
                  {t === "all" ? "all types" : `${t}s`}
                </Button>
              ))}
            </div>
            {commands.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkMigrating(true)}
                className="ml-auto text-xs"
              >
                <ArrowRight className="h-3.5 w-3.5 mr-1" />
                Migrate All Commands ({commands.length})
              </Button>
            )}
            {skills.length > 0 && commands.length === 0 && (
              <span className="ml-auto text-xs text-muted-foreground self-center">
                {filtered.length} of {skills.length} skills
              </span>
            )}
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {skills.length === 0
                  ? "No skills or commands found. Create your first one!"
                  : "No skills match your search."}
              </p>
              {skills.length === 0 && (
                <Button size="sm" className="mt-3" asChild>
                  <Link href="/skills/new">
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Create Skill
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead>Modified</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((skill) => (
                  <TableRow key={skill.id}>
                    <TableCell>
                      <span className="font-medium font-mono text-sm">
                        /{skill.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground line-clamp-1 max-w-[300px]">
                        {skill.description || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {skill.scope === "personal" ? (
                        <Badge variant="secondary">Personal</Badge>
                      ) : (
                        <Badge variant="outline">
                          {skill.projectName || "Project"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={skill.type === "skill" ? "default" : "secondary"}
                        className="capitalize"
                      >
                        {skill.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {skill.frontmatter.context === "fork" && (
                          <Badge variant="outline" className="text-[10px]">
                            fork
                          </Badge>
                        )}
                        {skill.frontmatter.agent && (
                          <Badge variant="outline" className="text-[10px]">
                            {skill.frontmatter.agent}
                          </Badge>
                        )}
                        {skill.frontmatter.model && (
                          <Badge variant="outline" className="text-[10px]">
                            {skill.frontmatter.model}
                          </Badge>
                        )}
                        {skill.frontmatter["disable-model-invocation"] && (
                          <Badge variant="outline" className="text-[10px]">
                            user-only
                          </Badge>
                        )}
                        {skill.frontmatter["user-invocable"] === false && (
                          <Badge variant="outline" className="text-[10px]">
                            auto-only
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(skill.lastModified)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {skill.type === "command" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openMigrate(skill)}
                            title="Migrate to Skill"
                          >
                            <ArrowRight className="h-4 w-4 text-primary" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setViewing(skill)}
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(skill)}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(skill)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* View Dialog */}
        <Dialog
          open={!!viewing}
          onOpenChange={(open) => {
            if (!open) setViewing(null);
          }}
        >
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-mono">
                /{viewing?.name}
              </DialogTitle>
              <DialogDescription>
                {viewing?.description || "No description"}
              </DialogDescription>
            </DialogHeader>
            {viewing && (
              <div className="space-y-4 py-2">
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="secondary">{viewing.scope}</Badge>
                  <Badge variant={viewing.type === "skill" ? "default" : "secondary"}>
                    {viewing.type}
                  </Badge>
                  {viewing.projectName && (
                    <Badge variant="outline">{viewing.projectName}</Badge>
                  )}
                </div>

                {Object.keys(viewing.frontmatter).length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Frontmatter
                    </Label>
                    <div className="bg-muted rounded-md p-3 font-mono text-xs space-y-1">
                      {Object.entries(viewing.frontmatter).map(([key, val]) => (
                        <div key={key}>
                          <span className="text-muted-foreground">{key}:</span>{" "}
                          {typeof val === "boolean"
                            ? val.toString()
                            : typeof val === "object"
                              ? JSON.stringify(val)
                              : String(val)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Content
                  </Label>
                  <pre className="bg-muted rounded-md p-3 font-mono text-xs whitespace-pre-wrap overflow-x-auto max-h-[400px] overflow-y-auto">
                    {viewing.content || "(empty)"}
                  </pre>
                </div>

                <div className="text-xs text-muted-foreground font-mono">
                  {viewing.filePath}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (viewing) {
                    openEdit(viewing);
                    setViewing(null);
                  }
                }}
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
              <Button variant="outline" onClick={() => setViewing(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog
          open={!!editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        >
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Edit: /{editing?.name}
              </DialogTitle>
              <DialogDescription>
                {editing?.filePath}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name" className="text-xs">
                    Name
                  </Label>
                  <Input
                    id="edit-name"
                    value={editFm.name || ""}
                    onChange={(e) =>
                      setEditFm({ ...editFm, name: e.target.value })
                    }
                    className="h-8 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-model" className="text-xs">
                    Model
                  </Label>
                  <Input
                    id="edit-model"
                    value={editFm.model || ""}
                    onChange={(e) =>
                      setEditFm({ ...editFm, model: e.target.value })
                    }
                    placeholder="e.g. claude-opus-4-6"
                    className="h-8 text-sm font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-desc" className="text-xs">
                  Description
                </Label>
                <Input
                  id="edit-desc"
                  value={editFm.description || ""}
                  onChange={(e) =>
                    setEditFm({ ...editFm, description: e.target.value })
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-tools" className="text-xs">
                    Allowed Tools
                  </Label>
                  <Input
                    id="edit-tools"
                    value={
                      typeof editFm["allowed-tools"] === "string"
                        ? editFm["allowed-tools"]
                        : Array.isArray(editFm["allowed-tools"])
                          ? editFm["allowed-tools"].join(", ")
                          : ""
                    }
                    onChange={(e) =>
                      setEditFm({ ...editFm, "allowed-tools": e.target.value })
                    }
                    placeholder="Read, Grep, Bash"
                    className="h-8 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-hint" className="text-xs">
                    Argument Hint
                  </Label>
                  <Input
                    id="edit-hint"
                    value={editFm["argument-hint"] || ""}
                    onChange={(e) =>
                      setEditFm({ ...editFm, "argument-hint": e.target.value })
                    }
                    placeholder="[issue-number]"
                    className="h-8 text-sm font-mono"
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={editFm["disable-model-invocation"] || false}
                    onChange={(e) =>
                      setEditFm({
                        ...editFm,
                        "disable-model-invocation": e.target.checked || undefined,
                      })
                    }
                  />
                  User-only (disable model invocation)
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={editFm["user-invocable"] === false}
                    onChange={(e) =>
                      setEditFm({
                        ...editFm,
                        "user-invocable": e.target.checked ? false : undefined,
                      })
                    }
                  />
                  Auto-only (hide from / menu)
                </label>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-content" className="text-xs">
                  Content
                </Label>
                <Textarea
                  id="edit-content"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="font-mono text-sm min-h-[250px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={!!deleting}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete /{deleting?.name}?</DialogTitle>
              <DialogDescription>
                This will permanently delete the file at{" "}
                <code className="text-xs">{deleting?.filePath}</code>. This
                cannot be undone.
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
        {/* Migrate Single Command Dialog */}
        <Dialog
          open={!!migrating}
          onOpenChange={(open) => {
            if (!open) {
              setMigrating(null);
              setMigrateResult(null);
            }
          }}
        >
          <DialogContent className="max-w-lg">
            {migrateResult ? (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-green-500" />
                    Migrated /{migrateResult.name}
                  </DialogTitle>
                  <DialogDescription>
                    Command converted to skill format.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="text-xs font-mono text-muted-foreground bg-muted rounded-md p-2">
                    {migrateResult.newPath}
                  </div>
                  {migrateResult.addedDisableModelInvocation && (
                    <div className="flex items-start gap-2 text-xs bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded-md p-2">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      Added <code>disable-model-invocation: true</code> — this
                      command has side effects.
                    </div>
                  )}
                  {migrateResult.warnings.map((w, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-xs bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 rounded-md p-2"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      {w}
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      setMigrating(null);
                      setMigrateResult(null);
                    }}
                  >
                    Done
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>
                    Migrate /{migrating?.name} to Skill
                  </DialogTitle>
                  <DialogDescription>
                    Converts{" "}
                    <code className="text-xs">commands/{migrating?.name}.md</code>{" "}
                    to{" "}
                    <code className="text-xs">
                      skills/{migrating?.name}/SKILL.md
                    </code>
                    . The original command file will be deleted.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="migrate-desc" className="text-xs">
                      Description
                    </Label>
                    <Input
                      id="migrate-desc"
                      value={migrateDesc}
                      onChange={(e) => setMigrateDesc(e.target.value)}
                      placeholder="What this skill does and when to use it"
                      className="h-8 text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Claude uses this to decide when to auto-invoke. Recommended
                      but optional.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={migrateDisableModel}
                      onChange={(e) =>
                        setMigrateDisableModel(e.target.checked)
                      }
                    />
                    Add <code>disable-model-invocation: true</code> (user-only
                    — prevents Claude from auto-running)
                  </label>
                  <p className="text-xs text-muted-foreground">
                    If unchecked, the migration will auto-detect action commands
                    (deploy, push, commit, etc.) and add this flag for you.
                  </p>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setMigrating(null)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleMigrate} disabled={saving}>
                    {saving && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Migrate
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Bulk Migrate Dialog */}
        <Dialog
          open={bulkMigrating}
          onOpenChange={(open) => {
            if (!open) {
              setBulkMigrating(false);
              setBulkResult(null);
            }
          }}
        >
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            {bulkResult ? (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-green-500" />
                    Migration Complete
                  </DialogTitle>
                  <DialogDescription>
                    {bulkResult.migratedCount} migrated
                    {bulkResult.errorCount > 0 &&
                      `, ${bulkResult.errorCount} failed`}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-2 max-h-[400px] overflow-y-auto">
                  {bulkResult.migrated.map((m, i) => (
                    <div
                      key={i}
                      className="border rounded-md p-2 space-y-1"
                    >
                      <div className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-green-500" />
                        <span className="text-sm font-mono">/{m.name}</span>
                        {m.addedDisableModelInvocation && (
                          <Badge variant="outline" className="text-[10px]">
                            + user-only
                          </Badge>
                        )}
                      </div>
                      {m.warnings.map((w, j) => (
                        <div
                          key={j}
                          className="flex items-start gap-1.5 text-[11px] text-yellow-700 dark:text-yellow-300 pl-5"
                        >
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          {w}
                        </div>
                      ))}
                    </div>
                  ))}
                  {bulkResult.errors.map((e, i) => (
                    <div
                      key={i}
                      className="border border-destructive/50 rounded-md p-2"
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                        <span className="text-sm font-mono text-destructive">
                          {e.filePath.split("/").pop()}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground pl-5">
                        {e.error}
                      </p>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      setBulkMigrating(false);
                      setBulkResult(null);
                    }}
                  >
                    Done
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Migrate All Commands to Skills</DialogTitle>
                  <DialogDescription>
                    This will convert {commands.length} command
                    {commands.length !== 1 ? "s" : ""} to the skill format.
                    Each <code>commands/foo.md</code> becomes{" "}
                    <code>skills/foo/SKILL.md</code>. Original files are deleted.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-2">
                  <Label className="text-xs text-muted-foreground">
                    Commands to migrate:
                  </Label>
                  <div className="max-h-[200px] overflow-y-auto space-y-1">
                    {commands.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 text-sm font-mono"
                      >
                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        /{c.name}
                        {c.projectName && (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-sans"
                          >
                            {c.projectName}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground pt-2">
                    Action commands (deploy, push, commit, etc.) will
                    automatically get{" "}
                    <code>disable-model-invocation: true</code>. Commands without
                    a description will get a warning.
                  </p>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setBulkMigrating(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleBulkMigrate} disabled={saving}>
                    {saving && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Migrate {commands.length} Command
                    {commands.length !== 1 ? "s" : ""}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
