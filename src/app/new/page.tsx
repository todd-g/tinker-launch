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
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Key, AlertCircle } from "lucide-react";

interface Account {
  name: string;
  vercel_token: string;
}

interface Credentials {
  accounts: Record<string, Account>;
  org_mapping: Record<string, string>;
}

export default function NewProjectPage() {
  const router = useRouter();
  const createProject = useMutation(api.projects.create);
  const nextPort = useQuery(api.projects.getNextPort);

  const [repoName, setRepoName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [org, setOrg] = useState("");
  const [customOrg, setCustomOrg] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generateCredentials, setGenerateCredentials] = useState(true);

  // Credentials state
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [loadingCredentials, setLoadingCredentials] = useState(true);

  const fetchCredentials = useCallback(async () => {
    try {
      const response = await fetch("/api/credentials");
      const data = await response.json();
      if (data.success) {
        setCredentials(data.credentials);
        // Set default org to first in org_mapping
        const orgs = Object.keys(data.credentials.org_mapping);
        if (orgs.length > 0 && !org) {
          setOrg(orgs[0]);
        }
      }
    } catch (error) {
      console.error("Failed to fetch credentials:", error);
    } finally {
      setLoadingCredentials(false);
    }
  }, [org]);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const handleRepoNameChange = (value: string) => {
    // Convert to kebab-case
    const kebab = value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    setRepoName(kebab);
  };

  // Get account info for selected org
  const selectedOrg = org === "__custom__" ? customOrg : org;
  const accountKey = credentials?.org_mapping[selectedOrg];
  const account = accountKey ? credentials?.accounts[accountKey] : null;
  const hasVercelToken = account && account.vercel_token;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalOrg = org === "__custom__" ? customOrg : org;

    if (!repoName || !projectName || !description || !finalOrg) {
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
          org: finalOrg,
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
        org: finalOrg,
        description,
        localPath: result.localPath,
        githubUrl: result.githubUrl,
        port: nextPort ?? 3001,
      });

      // Generate credentials if enabled and account has Vercel token
      if (generateCredentials && hasVercelToken) {
        try {
          await fetch("/api/generate-project-env", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectPath: result.localPath,
              repoName,
              org: finalOrg,
            }),
          });
        } catch (credError) {
          console.error("Failed to generate credentials:", credError);
          // Don't block project creation if credential generation fails
        }
      }

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsCreating(false);
    }
  };

  const orgs = credentials ? Object.keys(credentials.org_mapping) : [];

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
                  {loadingCredentials ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading organizations...
                    </div>
                  ) : (
                    <>
                      <Select value={org} onValueChange={setOrg}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select organization" />
                        </SelectTrigger>
                        <SelectContent>
                          {orgs.map((orgName) => {
                            const acctKey = credentials?.org_mapping[orgName];
                            const acct = acctKey ? credentials?.accounts[acctKey] : null;
                            return (
                              <SelectItem key={orgName} value={orgName}>
                                <span className="flex items-center gap-2">
                                  {orgName}
                                  {acct && (
                                    <span className="text-xs text-muted-foreground">
                                      ({acct.name})
                                    </span>
                                  )}
                                </span>
                              </SelectItem>
                            );
                          })}
                          <SelectItem value="__custom__">
                            <span className="text-muted-foreground">+ Custom organization...</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {org === "__custom__" && (
                        <Input
                          placeholder="Enter organization name"
                          value={customOrg}
                          onChange={(e) => setCustomOrg(e.target.value)}
                          className="mt-2"
                        />
                      )}
                    </>
                  )}

                  {/* Account info display */}
                  {selectedOrg && credentials && (
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <Key className="h-4 w-4 text-muted-foreground" />
                      {accountKey ? (
                        <>
                          <span className="text-muted-foreground">Account:</span>
                          <Badge variant="secondary">{account?.name || accountKey}</Badge>
                          {hasVercelToken ? (
                            <span className="text-green-600 text-xs">Vercel token configured</span>
                          ) : (
                            <span className="text-yellow-600 text-xs">No Vercel token</span>
                          )}
                        </>
                      ) : (
                        <span className="text-yellow-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          No account mapped for this org
                        </span>
                      )}
                    </div>
                  )}
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

                {/* Generate credentials checkbox */}
                {hasVercelToken && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="generateCredentials"
                      checked={generateCredentials}
                      onChange={(e) => setGenerateCredentials(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="generateCredentials" className="text-sm font-normal">
                      Generate .envrc and cli.sh with credentials
                    </Label>
                  </div>
                )}

                <div className="rounded-lg bg-muted p-4 text-sm">
                  <p className="font-medium mb-2">This will:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>
                      Create GitHub repo at{" "}
                      <code className="bg-background px-1 rounded">
                        {selectedOrg || "org"}/{repoName || "repo-name"}
                      </code>
                    </li>
                    <li>
                      Create local folder at{" "}
                      <code className="bg-background px-1 rounded">
                        $PROJECTS_DIR/{repoName || "repo-name"}
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
                    {generateCredentials && hasVercelToken && (
                      <li>
                        Generate <code className="bg-background px-1 rounded">.envrc</code> and{" "}
                        <code className="bg-background px-1 rounded">cli.sh</code> with{" "}
                        {account?.name} Vercel token (add Convex keys later in Settings)
                      </li>
                    )}
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
