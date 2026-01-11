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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function NewProjectPage() {
  const router = useRouter();
  const createProject = useMutation(api.projects.create);
  const nextPort = useQuery(api.projects.getNextPort);

  const [repoName, setRepoName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [org, setOrg] = useState<"todd-g" | "minimagroup">("todd-g");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRepoNameChange = (value: string) => {
    // Convert to kebab-case
    const kebab = value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    setRepoName(kebab);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoName || !projectName || !description) {
      setError("All fields are required");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/create-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoName,
          projectName,
          org,
          description,
          port: nextPort ?? 3001,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "Failed to create project");
        setIsCreating(false);
        return;
      }

      // Save to Convex
      await createProject({
        repoName,
        projectName,
        org,
        description,
        localPath: result.localPath,
        githubUrl: result.githubUrl,
        port: nextPort ?? 3001,
      });

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsCreating(false);
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
                <BreadcrumbLink href="/">Projects</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>New Project</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Create New Project</CardTitle>
              <CardDescription>
                Set up a new project with GitHub repo, local folder, and default
                configurations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="repoName">Repository Name</Label>
                    <Input
                      id="repoName"
                      placeholder="my-new-project"
                      value={repoName}
                      onChange={(e) => handleRepoNameChange(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Will be converted to kebab-case
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="projectName">Project Name</Label>
                    <Input
                      id="projectName"
                      placeholder="My New Project"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Display name for the project
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="org">Organization</Label>
                  <Select value={org} onValueChange={(v) => setOrg(v as typeof org)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todd-g">todd-g (Personal)</SelectItem>
                      <SelectItem value="minimagroup">minimagroup (Company)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="A one-paragraph description of what this project does..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                  />
                </div>

                <div className="rounded-lg bg-muted p-4 text-sm">
                  <p className="font-medium mb-2">This will:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>
                      Create GitHub repo at{" "}
                      <code className="bg-background px-1 rounded">
                        {org}/{repoName || "repo-name"}
                      </code>
                    </li>
                    <li>
                      Create local folder at{" "}
                      <code className="bg-background px-1 rounded">
                        ~/Documents/GitHub/{repoName || "repo-name"}
                      </code>
                    </li>
                    <li>Initialize git with remote origin</li>
                    <li>Generate CLAUDE.md and TECH_STACK.md</li>
                    <li>
                      Assign port{" "}
                      <code className="bg-background px-1 rounded">
                        {nextPort ?? "..."}
                      </code>
                    </li>
                  </ul>
                </div>

                {error && (
                  <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button type="submit" disabled={isCreating}>
                    {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Project
                  </Button>
                  <Button type="button" variant="outline" onClick={() => router.back()}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
