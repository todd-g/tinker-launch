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
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import {
  FolderSearch,
  RefreshCw,
  Loader2,
  Check,
  AlertCircle,
  FileCode,
  Import,
  CheckCircle2,
  Key,
} from "lucide-react";

interface ScannedProject {
  localPath: string;
  folderName: string;
  org: string | null;
  repo: string | null;
  githubUrl: string | null;
  hasTinkerYaml: boolean;
  tinkerConfig: {
    name?: string;
    description?: string;
    port?: number;
  } | null;
}

interface ImportStatus {
  status: "idle" | "importing" | "success" | "error" | "exists";
  message?: string;
}

interface ImportedProject {
  repoName: string;
  projectName: string;
  localPath: string;
  org: string;
}

interface ConvexKeysForm {
  production: string;
  preview: string;
  dev: string;
}

interface Credentials {
  accounts: Record<string, { name: string; vercel_token: string }>;
  org_mapping: Record<string, string>;
}

export default function ImportProjectsPage() {
  const [scanning, setScanning] = useState(false);
  const [projects, setProjects] = useState<ScannedProject[]>([]);
  const [baseDir, setBaseDir] = useState("");
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [importStatuses, setImportStatuses] = useState<Record<string, ImportStatus>>({});
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState("");

  // Credentials modal state
  const [credentialsModalOpen, setCredentialsModalOpen] = useState(false);
  const [importedProjects, setImportedProjects] = useState<ImportedProject[]>([]);
  const [convexKeysForm, setConvexKeysForm] = useState<Record<string, ConvexKeysForm>>({});
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [generatingCredentials, setGeneratingCredentials] = useState(false);
  const [credentialStatuses, setCredentialStatuses] = useState<Record<string, "pending" | "generating" | "success" | "error">>({});

  // Convex
  const existingProjects = useQuery(api.projects.list, {});
  const createProject = useMutation(api.projects.create);
  const nextPort = useQuery(api.projects.getNextPort);

  // Get set of existing repo names for quick lookup
  const existingRepoNames = new Set(existingProjects?.map((p) => p.repoName) || []);

  const scanProjects = useCallback(async () => {
    setScanning(true);
    try {
      const response = await fetch("/api/scan-projects");
      const data = await response.json();
      if (data.success) {
        setProjects(data.projects);
        setBaseDir(data.baseDir);
      }
    } catch (error) {
      console.error("Failed to scan projects:", error);
    } finally {
      setScanning(false);
    }
  }, []);

  const fetchCredentials = useCallback(async () => {
    try {
      const response = await fetch("/api/credentials");
      const data = await response.json();
      if (data.success) {
        setCredentials(data.credentials);
      }
    } catch (error) {
      console.error("Failed to fetch credentials:", error);
    }
  }, []);

  useEffect(() => {
    scanProjects();
    fetchCredentials();
  }, [scanProjects, fetchCredentials]);

  const toggleProjectSelection = (localPath: string) => {
    const newSelected = new Set(selectedProjects);
    if (newSelected.has(localPath)) {
      newSelected.delete(localPath);
    } else {
      newSelected.add(localPath);
    }
    setSelectedProjects(newSelected);
  };

  const toggleSelectAll = () => {
    const importableProjects = filteredProjects.filter(
      (p) => p.org && p.repo && !existingRepoNames.has(p.repo)
    );
    if (selectedProjects.size === importableProjects.length) {
      setSelectedProjects(new Set());
    } else {
      setSelectedProjects(new Set(importableProjects.map((p) => p.localPath)));
    }
  };

  const handleImport = async () => {
    if (selectedProjects.size === 0) return;

    setImporting(true);
    let currentPort = nextPort || 3002;
    const successfullyImported: ImportedProject[] = [];

    for (const localPath of selectedProjects) {
      const project = projects.find((p) => p.localPath === localPath);
      if (!project || !project.org || !project.repo) continue;

      // Check if already exists
      if (existingRepoNames.has(project.repo)) {
        setImportStatuses((prev) => ({
          ...prev,
          [localPath]: { status: "exists", message: "Already registered" },
        }));
        continue;
      }

      setImportStatuses((prev) => ({
        ...prev,
        [localPath]: { status: "importing" },
      }));

      try {
        // Use tinker config if available, otherwise derive from folder/repo
        const projectName = project.tinkerConfig?.name ||
          project.folderName
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
        const description = project.tinkerConfig?.description || `Imported project: ${project.repo}`;
        const port = project.tinkerConfig?.port || currentPort++;

        await createProject({
          repoName: project.repo,
          projectName,
          org: project.org,
          description,
          localPath: project.localPath,
          githubUrl: project.githubUrl || "",
          port,
        });

        setImportStatuses((prev) => ({
          ...prev,
          [localPath]: { status: "success", message: `Port ${port}` },
        }));

        // Track successfully imported project
        successfullyImported.push({
          repoName: project.repo,
          projectName,
          localPath: project.localPath,
          org: project.org,
        });

        // Update next port if we used the auto-assigned one
        if (!project.tinkerConfig?.port) {
          currentPort++;
        }
      } catch (error) {
        setImportStatuses((prev) => ({
          ...prev,
          [localPath]: {
            status: "error",
            message: error instanceof Error ? error.message : "Import failed",
          },
        }));
      }
    }

    setImporting(false);

    // Show credentials modal if any projects were imported
    if (successfullyImported.length > 0) {
      setImportedProjects(successfullyImported);
      // Initialize empty form for each project
      const initialForm: Record<string, ConvexKeysForm> = {};
      successfullyImported.forEach((p) => {
        initialForm[p.repoName] = { production: "", preview: "", dev: "" };
      });
      setConvexKeysForm(initialForm);
      setCredentialStatuses({});
      setCredentialsModalOpen(true);
    }

    setSelectedProjects(new Set());
  };

  // Filter projects
  const filteredProjects = projects.filter((p) => {
    if (!filter) return true;
    const searchLower = filter.toLowerCase();
    return (
      p.folderName.toLowerCase().includes(searchLower) ||
      p.org?.toLowerCase().includes(searchLower) ||
      p.repo?.toLowerCase().includes(searchLower)
    );
  });

  // Count importable projects (have git remote and not already registered)
  const importableCount = filteredProjects.filter(
    (p) => p.org && p.repo && !existingRepoNames.has(p.repo)
  ).length;

  // Get account for an org
  const getAccountForOrg = (org: string) => {
    if (!credentials) return null;
    const accountKey = credentials.org_mapping[org];
    if (!accountKey) return null;
    return { key: accountKey, ...credentials.accounts[accountKey] };
  };

  // Handle generating credentials for imported projects
  const handleGenerateCredentials = async () => {
    setGeneratingCredentials(true);

    for (const project of importedProjects) {
      setCredentialStatuses((prev) => ({ ...prev, [project.repoName]: "generating" }));

      try {
        // Save Convex keys if any were entered
        const keys = convexKeysForm[project.repoName];
        if (keys && (keys.production || keys.preview || keys.dev)) {
          await fetch("/api/credentials", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              setConvexKeys: {
                repoName: project.repoName,
                keys: {
                  production: keys.production || undefined,
                  preview: keys.preview || undefined,
                  dev: keys.dev || undefined,
                },
              },
            }),
          });
        }

        // Generate .envrc and cli.sh
        const response = await fetch("/api/generate-project-env", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectPath: project.localPath,
            repoName: project.repoName,
            org: project.org,
          }),
        });

        const result = await response.json();
        if (result.success) {
          setCredentialStatuses((prev) => ({ ...prev, [project.repoName]: "success" }));
        } else {
          setCredentialStatuses((prev) => ({ ...prev, [project.repoName]: "error" }));
        }
      } catch (error) {
        console.error(`Failed to generate credentials for ${project.repoName}:`, error);
        setCredentialStatuses((prev) => ({ ...prev, [project.repoName]: "error" }));
      }
    }

    setGeneratingCredentials(false);
  };

  // Check if all credentials are generated
  const allCredentialsGenerated = importedProjects.length > 0 &&
    importedProjects.every((p) => credentialStatuses[p.repoName] === "success");

  // Update convex keys form for a specific project
  const updateConvexKeys = (repoName: string, field: keyof ConvexKeysForm, value: string) => {
    setConvexKeysForm((prev) => ({
      ...prev,
      [repoName]: { ...prev[repoName], [field]: value },
    }));
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
                <BreadcrumbLink href="/settings">Settings</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Import Projects</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FolderSearch className="h-5 w-5" />
                    Import Existing Projects
                  </CardTitle>
                  <CardDescription>
                    Scan {baseDir || "~/Documents/GitHub"} and import projects into Tinker Launch
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={scanProjects} disabled={scanning}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? "animate-spin" : ""}`} />
                    Rescan
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={selectedProjects.size === 0 || importing}
                  >
                    {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Import className="h-4 w-4 mr-2" />
                    Import Selected ({selectedProjects.size})
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex items-center gap-4">
                <Input
                  placeholder="Filter projects..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="max-w-sm"
                />
                <div className="text-sm text-muted-foreground">
                  {filteredProjects.length} projects found, {importableCount} importable
                </div>
              </div>

              {scanning ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredProjects.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <input
                          type="checkbox"
                          checked={
                            importableCount > 0 &&
                            selectedProjects.size === importableCount
                          }
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                      </TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Org</TableHead>
                      <TableHead>Config</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProjects.map((project) => {
                      const isRegistered = project.repo && existingRepoNames.has(project.repo);
                      const hasGitRemote = project.org && project.repo;
                      const canImport = hasGitRemote && !isRegistered;
                      const status = importStatuses[project.localPath];

                      return (
                        <TableRow
                          key={project.localPath}
                          className={isRegistered ? "opacity-50" : ""}
                        >
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedProjects.has(project.localPath)}
                              onChange={() => toggleProjectSelection(project.localPath)}
                              disabled={!canImport}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium flex items-center gap-2">
                                {project.tinkerConfig?.name || project.folderName}
                                {project.hasTinkerYaml && (
                                  <span title=".tinker.yaml">
                                    <FileCode className="h-3 w-3 text-muted-foreground" />
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {project.repo || project.folderName}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {project.org ? (
                              <Badge variant="outline">{project.org}</Badge>
                            ) : (
                              <span className="text-xs text-yellow-600 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                No git remote
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {project.tinkerConfig?.port && (
                              <span className="text-xs">
                                Port: {project.tinkerConfig.port}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {isRegistered ? (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <CheckCircle2 className="h-3 w-3" />
                                Registered
                              </div>
                            ) : status?.status === "importing" ? (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Importing...
                              </div>
                            ) : status?.status === "success" ? (
                              <div className="flex items-center gap-1 text-xs text-green-600">
                                <Check className="h-3 w-3" />
                                Imported ({status.message})
                              </div>
                            ) : status?.status === "error" ? (
                              <div className="flex items-center gap-1 text-xs text-red-600">
                                <AlertCircle className="h-3 w-3" />
                                {status.message}
                              </div>
                            ) : status?.status === "exists" ? (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <CheckCircle2 className="h-3 w-3" />
                                {status.message}
                              </div>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center text-muted-foreground py-12">
                  No projects found in {baseDir}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Post-Import Credentials Modal */}
        <Dialog open={credentialsModalOpen} onOpenChange={setCredentialsModalOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Set Up Credentials
              </DialogTitle>
              <DialogDescription>
                Configure Convex keys for your imported projects. Vercel tokens are automatically assigned based on org mapping.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {importedProjects.map((project) => {
                const account = getAccountForOrg(project.org);
                const status = credentialStatuses[project.repoName];

                return (
                  <div key={project.repoName} className="border rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{project.projectName}</h4>
                        <p className="text-sm text-muted-foreground">{project.repoName}</p>
                      </div>
                      {status === "generating" && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                      {status === "success" && (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                      {status === "error" && (
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Account:</span>{" "}
                        {account ? (
                          <Badge variant="outline">{account.name}</Badge>
                        ) : (
                          <span className="text-yellow-600">No account mapped for {project.org}</span>
                        )}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Org:</span>{" "}
                        <Badge variant="secondary">{project.org}</Badge>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label htmlFor={`${project.repoName}-production`} className="text-xs">
                          Convex Production Key
                        </Label>
                        <Input
                          id={`${project.repoName}-production`}
                          placeholder="prod:xxx..."
                          value={convexKeysForm[project.repoName]?.production || ""}
                          onChange={(e) => updateConvexKeys(project.repoName, "production", e.target.value)}
                          disabled={status === "success" || generatingCredentials}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor={`${project.repoName}-preview`} className="text-xs">
                            Preview Key (optional)
                          </Label>
                          <Input
                            id={`${project.repoName}-preview`}
                            placeholder="preview:xxx..."
                            value={convexKeysForm[project.repoName]?.preview || ""}
                            onChange={(e) => updateConvexKeys(project.repoName, "preview", e.target.value)}
                            disabled={status === "success" || generatingCredentials}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`${project.repoName}-dev`} className="text-xs">
                            Dev Key (optional)
                          </Label>
                          <Input
                            id={`${project.repoName}-dev`}
                            placeholder="dev:xxx..."
                            value={convexKeysForm[project.repoName]?.dev || ""}
                            onChange={(e) => updateConvexKeys(project.repoName, "dev", e.target.value)}
                            disabled={status === "success" || generatingCredentials}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              {allCredentialsGenerated ? (
                <Button onClick={() => setCredentialsModalOpen(false)}>
                  Done
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setCredentialsModalOpen(false)}
                    disabled={generatingCredentials}
                  >
                    Skip for Now
                  </Button>
                  <Button
                    onClick={handleGenerateCredentials}
                    disabled={generatingCredentials || importedProjects.some((p) => !getAccountForOrg(p.org))}
                  >
                    {generatingCredentials && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Generate Credentials
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
