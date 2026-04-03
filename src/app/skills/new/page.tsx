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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import { useDbQuery, useDbMutation } from "@/hooks/use-db";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface DbProject {
  id: string;
  projectName: string;
  repoName: string;
  localPath: string;
}

export default function NewSkillPage() {
  const router = useRouter();
  const [scope, setScope] = useState<"personal" | "project">("personal");
  const [type, setType] = useState<"skill" | "command">("skill");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Advanced fields
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [allowedTools, setAllowedTools] = useState("");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [argumentHint, setArgumentHint] = useState("");
  const [disableModelInvocation, setDisableModelInvocation] = useState(false);
  const [userInvocable, setUserInvocable] = useState(true);
  const [context, setContext] = useState("");
  const [agent, setAgent] = useState("");

  const { data: projectsData } = useDbQuery<{
    success: boolean;
    projects: DbProject[];
  }>("/api/db/projects");
  const projects = projectsData?.projects ?? [];

  const { mutate } = useDbMutation("/api/skills");

  const nameError = useMemo(() => {
    if (!name) return "";
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      return "Use lowercase letters, numbers, and hyphens only";
    }
    return "";
  }, [name]);

  const preview = useMemo(() => {
    const lines: string[] = ["---"];
    lines.push(`name: ${name || "my-skill"}`);
    if (description) lines.push(`description: ${description}`);
    if (disableModelInvocation) lines.push("disable-model-invocation: true");
    if (!userInvocable) lines.push("user-invocable: false");
    if (allowedTools) lines.push(`allowed-tools: ${allowedTools}`);
    if (model) lines.push(`model: ${model}`);
    if (effort) lines.push(`effort: ${effort}`);
    if (context) lines.push(`context: ${context}`);
    if (agent) lines.push(`agent: ${agent}`);
    if (argumentHint) lines.push(`argument-hint: ${argumentHint}`);
    lines.push("---");
    lines.push("");
    lines.push(content || "# Your skill content here");
    return lines.join("\n");
  }, [
    name,
    description,
    disableModelInvocation,
    userInvocable,
    allowedTools,
    model,
    effort,
    context,
    agent,
    argumentHint,
    content,
  ]);

  const handleCreate = async () => {
    if (!name || nameError) return;
    if (scope === "project" && !projectId) {
      setError("Select a project");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const frontmatter: Record<string, unknown> = { name, description };
      if (disableModelInvocation) frontmatter["disable-model-invocation"] = true;
      if (!userInvocable) frontmatter["user-invocable"] = false;
      if (allowedTools) frontmatter["allowed-tools"] = allowedTools;
      if (model) frontmatter.model = model;
      if (effort) frontmatter.effort = effort;
      if (context) frontmatter.context = context;
      if (agent) frontmatter.agent = agent;
      if (argumentHint) frontmatter["argument-hint"] = argumentHint;

      const result = await mutate({
        action: "create",
        scope,
        type,
        name,
        projectId: scope === "project" ? projectId : undefined,
        frontmatter,
        content,
      });

      if (result.success) {
        router.push("/skills");
      } else {
        setError(result.error || "Failed to create skill");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
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
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/skills">Skills</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>New Skill</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 gap-6 p-4 pt-0">
          {/* Form */}
          <div className="flex-1 max-w-xl space-y-5">
            {/* Scope & Type */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Scope</Label>
                <div className="flex gap-1">
                  <Button
                    variant={scope === "personal" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setScope("personal")}
                    className="flex-1"
                  >
                    Personal
                  </Button>
                  <Button
                    variant={scope === "project" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setScope("project")}
                    className="flex-1"
                  >
                    Project
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <div className="flex gap-1">
                  <Button
                    variant={type === "skill" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setType("skill")}
                    className="flex-1"
                  >
                    Skill
                  </Button>
                  <Button
                    variant={type === "command" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setType("command")}
                    className="flex-1"
                  >
                    Command
                  </Button>
                </div>
              </div>
            </div>

            {/* Project selector */}
            {scope === "project" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select a project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.projectName}{" "}
                        <span className="text-muted-foreground">
                          ({p.repoName})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="skill-name" className="text-xs">
                Name
              </Label>
              <Input
                id="skill-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-skill"
                className="h-8 text-sm font-mono"
              />
              {nameError && (
                <p className="text-xs text-destructive">{nameError}</p>
              )}
              {name && !nameError && (
                <p className="text-xs text-muted-foreground">
                  Invoked as <code className="bg-muted px-1 rounded">/{name}</code>
                </p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="skill-desc" className="text-xs">
                Description
              </Label>
              <Input
                id="skill-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this skill does and when to use it"
                className="h-8 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Claude uses this to decide when to auto-invoke the skill
              </p>
            </div>

            {/* Content */}
            <div className="space-y-1.5">
              <Label htmlFor="skill-content" className="text-xs">
                Content
              </Label>
              <Textarea
                id="skill-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Instructions for Claude when this skill is invoked..."
                className="font-mono text-sm min-h-[200px]"
              />
            </div>

            {/* Advanced */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAdvanced ? "Hide" : "Show"} advanced options
              </button>

              {showAdvanced && (
                <div className="space-y-3 border rounded-md p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Allowed Tools</Label>
                      <Input
                        value={allowedTools}
                        onChange={(e) => setAllowedTools(e.target.value)}
                        placeholder="Read, Grep, Bash"
                        className="h-8 text-sm font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Model</Label>
                      <Input
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="claude-opus-4-6"
                        className="h-8 text-sm font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Effort</Label>
                      <Select value={effort} onValueChange={setEffort}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Default" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="max">Max</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Argument Hint</Label>
                      <Input
                        value={argumentHint}
                        onChange={(e) => setArgumentHint(e.target.value)}
                        placeholder="[issue-number]"
                        className="h-8 text-sm font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Context</Label>
                      <Select value={context} onValueChange={setContext}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Default (main)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fork">Fork (subagent)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Agent Type</Label>
                      <Select value={agent} onValueChange={setAgent}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Default" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Explore">Explore</SelectItem>
                          <SelectItem value="Plan">Plan</SelectItem>
                          <SelectItem value="general-purpose">
                            General Purpose
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-4 pt-1">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={disableModelInvocation}
                        onChange={(e) =>
                          setDisableModelInvocation(e.target.checked)
                        }
                      />
                      User-only invocation
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={!userInvocable}
                        onChange={(e) => setUserInvocable(!e.target.checked)}
                      />
                      Auto-only (hide from / menu)
                    </label>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={saving || !name || !!nameError}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create {type === "skill" ? "Skill" : "Command"}
              </Button>
              <Button variant="outline" onClick={() => router.push("/skills")}>
                Cancel
              </Button>
            </div>
          </div>

          {/* Preview */}
          <div className="hidden lg:block flex-1 max-w-md">
            <div className="sticky top-4 space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">
                  File Preview
                </Label>
                {scope === "personal" ? (
                  <Badge variant="secondary" className="text-[10px]">
                    ~/.claude/{type === "skill" ? "skills" : "commands"}/
                    {name || "..."}
                    {type === "skill" ? "/SKILL.md" : ".md"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    .claude/{type === "skill" ? "skills" : "commands"}/
                    {name || "..."}
                    {type === "skill" ? "/SKILL.md" : ".md"}
                  </Badge>
                )}
              </div>
              <pre className="bg-muted rounded-md p-3 font-mono text-xs whitespace-pre-wrap overflow-x-auto max-h-[600px] overflow-y-auto">
                {preview}
              </pre>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
