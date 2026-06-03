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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState, useEffect, useCallback } from "react";
import { useDbQuery } from "@/hooks/use-db";
import {
  Plus,
  Pencil,
  Trash2,
  Key,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
  Loader2,
  FolderKey,
  Check,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Account {
  name: string;
  vercel_token: string;
}

interface ConvexKeys {
  production?: string;
  preview?: string;
  dev?: string;
}

interface Credentials {
  accounts: Record<string, Account>;
  org_mapping: Record<string, string>;
  convex_keys: Record<string, ConvexKeys>;
  linear_keys: Record<string, string>;
  neon_keys: Record<string, string>;
}

interface DirenvStatus {
  installed: boolean;
  path: string | null;
  version: string | null;
  instructions: {
    title: string;
    description: string;
    steps: Array<{
      title: string;
      command?: string;
      note?: string;
      zsh?: string;
      bash?: string;
    }>;
    links: Array<{ title: string; url: string }>;
  } | null;
}

interface ProjectGenStatus {
  status: "idle" | "generating" | "success" | "error" | "no-credentials";
  message?: string;
}

export default function CredentialsPage() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [direnvStatus, setDirenvStatus] = useState<DirenvStatus | null>(null);
  const [checkingDirenv, setCheckingDirenv] = useState(false);

  // Account dialog state
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [editingAccountKey, setEditingAccountKey] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState({
    key: "",
    name: "",
    vercel_token: "",
  });

  // Convex keys dialog state
  const [convexKeysDialogOpen, setConvexKeysDialogOpen] = useState(false);
  const [editingConvexKeysRepo, setEditingConvexKeysRepo] = useState<string | null>(null);
  const [convexKeysForm, setConvexKeysForm] = useState({
    production: "",
    preview: "",
    dev: "",
  });

  // Linear key dialog state
  const [linearKeyDialogOpen, setLinearKeyDialogOpen] = useState(false);
  const [editingLinearKeyProject, setEditingLinearKeyProject] = useState<{ repoName: string; linearSlug: string } | null>(null);
  const [linearKeyForm, setLinearKeyForm] = useState({ key: "" });

  // Neon key dialog state
  const [neonKeyDialogOpen, setNeonKeyDialogOpen] = useState(false);
  const [editingNeonKeyProject, setEditingNeonKeyProject] = useState<{ repoName: string; neonOrgSlug: string } | null>(null);
  const [neonKeyForm, setNeonKeyForm] = useState({ key: "" });

  // Org dialog state
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<string | null>(null);
  const [orgForm, setOrgForm] = useState({
    org: "",
    accountKey: "",
  });

  // Delete confirmation
  const [deleteAccountKey, setDeleteAccountKey] = useState<string | null>(null);
  const [deleteOrg, setDeleteOrg] = useState<string | null>(null);

  // Bulk update state
  const { data: projectsData } = useDbQuery<{ success: boolean; projects: Array<{ id: string; repoName: string; projectName: string; org: string; localPath: string; linearSlug: string; neonOrgSlug: string; [key: string]: unknown }> }>("/api/db/projects");
  const projects = projectsData?.projects;
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [projectStatuses, setProjectStatuses] = useState<Record<string, ProjectGenStatus>>({});
  const [bulkGenerating, setBulkGenerating] = useState(false);

  const fetchCredentials = useCallback(async () => {
    try {
      const response = await fetch("/api/credentials");
      const data = await response.json();
      if (data.success) {
        setCredentials(data.credentials);
      }
    } catch (error) {
      console.error("Failed to fetch credentials:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkDirenv = async () => {
    setCheckingDirenv(true);
    try {
      const response = await fetch("/api/check-direnv");
      const data = await response.json();
      if (data.success) {
        setDirenvStatus(data);
      }
    } catch (error) {
      console.error("Failed to check direnv:", error);
    } finally {
      setCheckingDirenv(false);
    }
  };

  useEffect(() => {
    fetchCredentials();
    checkDirenv();
  }, [fetchCredentials]);

  const handleSaveAccount = async () => {
    setSaving(true);
    try {
      const body = editingAccountKey
        ? {
            updateAccount: {
              key: editingAccountKey,
              updates: {
                name: accountForm.name,
                vercel_token: accountForm.vercel_token,
              },
            },
          }
        : {
            addAccount: {
              key: accountForm.key,
              account: {
                name: accountForm.name,
                vercel_token: accountForm.vercel_token,
              },
            },
          };

      const response = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (data.success) {
        setCredentials(data.credentials);
        setAccountDialogOpen(false);
        resetAccountForm();
      }
    } catch (error) {
      console.error("Failed to save account:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConvexKeys = async () => {
    if (!editingConvexKeysRepo) return;
    setSaving(true);
    try {
      const response = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setConvexKeys: {
            repoName: editingConvexKeysRepo,
            keys: {
              production: convexKeysForm.production,
              preview: convexKeysForm.preview,
              dev: convexKeysForm.dev,
            },
          },
        }),
      });

      const data = await response.json();
      if (data.success) {
        setCredentials(data.credentials);
        setConvexKeysDialogOpen(false);
        resetConvexKeysForm();
      }
    } catch (error) {
      console.error("Failed to save Convex keys:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteAccountKey) return;
    setSaving(true);
    try {
      const response = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteAccount: { key: deleteAccountKey } }),
      });

      const data = await response.json();
      if (data.success) {
        setCredentials(data.credentials);
        setDeleteAccountKey(null);
      }
    } catch (error) {
      console.error("Failed to delete account:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOrg = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updateOrg: { org: orgForm.org, accountKey: orgForm.accountKey },
        }),
      });

      const data = await response.json();
      if (data.success) {
        setCredentials(data.credentials);
        setOrgDialogOpen(false);
        resetOrgForm();
      }
    } catch (error) {
      console.error("Failed to save org:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOrg = async () => {
    if (!deleteOrg) return;
    setSaving(true);
    try {
      const response = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteOrg: { org: deleteOrg } }),
      });

      const data = await response.json();
      if (data.success) {
        setCredentials(data.credentials);
        setDeleteOrg(null);
      }
    } catch (error) {
      console.error("Failed to delete org:", error);
    } finally {
      setSaving(false);
    }
  };

  const resetAccountForm = () => {
    setAccountForm({ key: "", name: "", vercel_token: "" });
    setEditingAccountKey(null);
  };

  const resetConvexKeysForm = () => {
    setConvexKeysForm({ production: "", preview: "", dev: "" });
    setEditingConvexKeysRepo(null);
  };

  const handleSaveLinearKey = async () => {
    if (!editingLinearKeyProject) return;
    setSaving(true);
    try {
      const response = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setLinearKey: {
            slug: editingLinearKeyProject.linearSlug,
            key: linearKeyForm.key,
          },
        }),
      });
      const data = await response.json();
      if (data.success) {
        setCredentials(data.credentials);
        setLinearKeyDialogOpen(false);
        setLinearKeyForm({ key: "" });
        setEditingLinearKeyProject(null);
      }
    } catch (error) {
      console.error("Failed to save Linear key:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLinearKey = async (linearSlug: string) => {
    setSaving(true);
    try {
      const response = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteLinearKey: { slug: linearSlug } }),
      });
      const data = await response.json();
      if (data.success) setCredentials(data.credentials);
    } catch (error) {
      console.error("Failed to delete Linear key:", error);
    } finally {
      setSaving(false);
    }
  };

  const openEditLinearKey = (repoName: string, linearSlug: string) => {
    setEditingLinearKeyProject({ repoName, linearSlug });
    setLinearKeyForm({ key: "" });
    setLinearKeyDialogOpen(true);
  };

  const handleSaveNeonKey = async () => {
    if (!editingNeonKeyProject) return;
    setSaving(true);
    try {
      const response = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setNeonKey: {
            slug: editingNeonKeyProject.neonOrgSlug,
            key: neonKeyForm.key,
          },
        }),
      });
      const data = await response.json();
      if (data.success) {
        setCredentials(data.credentials);
        setNeonKeyDialogOpen(false);
        setNeonKeyForm({ key: "" });
        setEditingNeonKeyProject(null);
      }
    } catch (error) {
      console.error("Failed to save Neon key:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNeonKey = async (neonOrgSlug: string) => {
    setSaving(true);
    try {
      const response = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteNeonKey: { slug: neonOrgSlug } }),
      });
      const data = await response.json();
      if (data.success) setCredentials(data.credentials);
    } catch (error) {
      console.error("Failed to delete Neon key:", error);
    } finally {
      setSaving(false);
    }
  };

  const openEditNeonKey = (repoName: string, neonOrgSlug: string) => {
    setEditingNeonKeyProject({ repoName, neonOrgSlug });
    setNeonKeyForm({ key: "" });
    setNeonKeyDialogOpen(true);
  };

  const resetOrgForm = () => {
    setOrgForm({ org: "", accountKey: "" });
    setEditingOrg(null);
  };

  const openEditAccount = (key: string, account: Account) => {
    setEditingAccountKey(key);
    setAccountForm({
      key,
      name: account.name,
      vercel_token: "",
    });
    setAccountDialogOpen(true);
  };

  const openEditConvexKeys = (repoName: string) => {
    setEditingConvexKeysRepo(repoName);
    // Don't pre-fill - user should enter new values
    setConvexKeysForm({ production: "", preview: "", dev: "" });
    setConvexKeysDialogOpen(true);
  };

  const openEditOrg = (org: string, accountKey: string) => {
    setEditingOrg(org);
    setOrgForm({ org, accountKey });
    setOrgDialogOpen(true);
  };

  // Toggle project selection
  const toggleProjectSelection = (projectId: string) => {
    const newSelected = new Set(selectedProjects);
    if (newSelected.has(projectId)) {
      newSelected.delete(projectId);
    } else {
      newSelected.add(projectId);
    }
    setSelectedProjects(newSelected);
  };

  // Select/deselect all projects
  const toggleSelectAll = () => {
    if (!projects) return;
    if (selectedProjects.size === projects.length) {
      setSelectedProjects(new Set());
    } else {
      setSelectedProjects(new Set(projects.map((p) => p.id)));
    }
  };

  // Generate credentials for selected projects
  const handleBulkGenerate = async () => {
    if (!projects || selectedProjects.size === 0) return;

    setBulkGenerating(true);
    const newStatuses: Record<string, ProjectGenStatus> = {};

    for (const projectId of selectedProjects) {
      const project = projects.find((p) => p.id === projectId);
      if (!project) continue;

      // Check if account is configured for this org
      const accountKey = credentials?.org_mapping[project.org];
      const account = accountKey ? credentials?.accounts[accountKey] : null;

      if (!account || !account.vercel_token) {
        newStatuses[projectId] = {
          status: "no-credentials",
          message: `No Vercel token configured for ${project.org}`,
        };
        setProjectStatuses((prev) => ({ ...prev, [projectId]: newStatuses[projectId] }));
        continue;
      }

      newStatuses[projectId] = { status: "generating" };
      setProjectStatuses((prev) => ({ ...prev, [projectId]: newStatuses[projectId] }));

      try {
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
          newStatuses[projectId] = { status: "success", message: result.message };
        } else {
          newStatuses[projectId] = { status: "error", message: result.error };
        }
      } catch (error) {
        newStatuses[projectId] = {
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }

      setProjectStatuses((prev) => ({ ...prev, [projectId]: newStatuses[projectId] }));
    }

    setBulkGenerating(false);
  };

  // Get account info for a project
  const getProjectAccountInfo = (org: string) => {
    if (!credentials) return null;
    const accountKey = credentials.org_mapping[org];
    if (!accountKey) return null;
    return credentials.accounts[accountKey];
  };

  if (loading) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="flex items-center justify-center h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

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
                <BreadcrumbPage>Credentials</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {/* Direnv Status */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    direnv Status
                  </CardTitle>
                  <CardDescription>
                    direnv auto-loads .envrc files when you cd into a directory
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={checkDirenv} disabled={checkingDirenv}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${checkingDirenv ? "animate-spin" : ""}`} />
                  Check
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {direnvStatus && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    {direnvStatus.installed ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <span className="font-medium">direnv is installed</span>
                        {direnvStatus.version && (
                          <Badge variant="secondary">v{direnvStatus.version}</Badge>
                        )}
                      </>
                    ) : (
                      <>
                        <XCircle className="h-5 w-5 text-red-500" />
                        <span className="font-medium">direnv is not installed</span>
                      </>
                    )}
                  </div>

                  {!direnvStatus.installed && direnvStatus.instructions && (
                    <div className="rounded-lg bg-muted p-4 space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {direnvStatus.instructions.description}
                      </p>
                      <ol className="list-decimal list-inside space-y-2 text-sm">
                        {direnvStatus.instructions.steps.map((step, i) => (
                          <li key={i}>
                            <span className="font-medium">{step.title}</span>
                            {step.command && (
                              <code className="ml-2 bg-background px-2 py-1 rounded text-xs">
                                {step.command}
                              </code>
                            )}
                            {step.zsh && (
                              <div className="mt-1 ml-4 text-xs text-muted-foreground">
                                zsh: <code className="bg-background px-1 rounded">{step.zsh}</code>
                              </div>
                            )}
                            {step.bash && (
                              <div className="ml-4 text-xs text-muted-foreground">
                                bash: <code className="bg-background px-1 rounded">{step.bash}</code>
                              </div>
                            )}
                            {step.note && (
                              <span className="ml-2 text-xs text-muted-foreground">({step.note})</span>
                            )}
                          </li>
                        ))}
                      </ol>
                      <div className="flex gap-2 pt-2">
                        {direnvStatus.instructions.links.map((link, i) => (
                          <a
                            key={i}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          >
                            {link.title}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Accounts */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Accounts</CardTitle>
                  <CardDescription>
                    Vercel tokens for each account (Convex, Linear, and Neon keys are per-project)
                  </CardDescription>
                </div>
                <Dialog open={accountDialogOpen} onOpenChange={(open) => {
                  setAccountDialogOpen(open);
                  if (!open) resetAccountForm();
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      Add Account
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        {editingAccountKey ? "Edit Account" : "Add Account"}
                      </DialogTitle>
                      <DialogDescription>
                        {editingAccountKey
                          ? "Update the account name and Vercel token. Leave token field empty to keep existing value."
                          : "Add a new account with a Vercel token. Convex keys are set per-project."}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      {!editingAccountKey && (
                        <div className="space-y-2">
                          <Label htmlFor="accountKey">Account Key</Label>
                          <Input
                            id="accountKey"
                            placeholder="e.g., personal, work, client-name"
                            value={accountForm.key}
                            onChange={(e) =>
                              setAccountForm({ ...accountForm, key: e.target.value })
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            Used internally to reference this account
                          </p>
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label htmlFor="accountName">Display Name</Label>
                        <Input
                          id="accountName"
                          placeholder="e.g., Personal, Work, Client Name"
                          value={accountForm.name}
                          onChange={(e) =>
                            setAccountForm({ ...accountForm, name: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="vercelToken">Vercel Token</Label>
                        <Input
                          id="vercelToken"
                          type="password"
                          placeholder={editingAccountKey ? "(unchanged)" : ""}
                          value={accountForm.vercel_token}
                          onChange={(e) =>
                            setAccountForm({ ...accountForm, vercel_token: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setAccountDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveAccount} disabled={saving}>
                        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {editingAccountKey ? "Update" : "Add"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Vercel Token</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {credentials &&
                    Object.entries(credentials.accounts).map(([key, account]) => (
                      <TableRow key={key}>
                        <TableCell className="font-mono text-sm">{key}</TableCell>
                        <TableCell>{account.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {account.vercel_token || <span className="text-yellow-500">Not set</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditAccount(key, account)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteAccountKey(key)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Org Mappings */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Organization Mappings</CardTitle>
                  <CardDescription>
                    Map GitHub organizations to credential accounts
                  </CardDescription>
                </div>
                <Dialog open={orgDialogOpen} onOpenChange={(open) => {
                  setOrgDialogOpen(open);
                  if (!open) resetOrgForm();
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      Add Mapping
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        {editingOrg ? "Edit Org Mapping" : "Add Org Mapping"}
                      </DialogTitle>
                      <DialogDescription>
                        Link a GitHub organization/username to a credential account.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="orgName">Organization/Username</Label>
                        <Input
                          id="orgName"
                          placeholder="e.g., my-username, my-org"
                          value={orgForm.org}
                          onChange={(e) =>
                            setOrgForm({ ...orgForm, org: e.target.value })
                          }
                          disabled={!!editingOrg}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="orgAccount">Account</Label>
                        <Select
                          value={orgForm.accountKey}
                          onValueChange={(value) =>
                            setOrgForm({ ...orgForm, accountKey: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select an account" />
                          </SelectTrigger>
                          <SelectContent>
                            {credentials &&
                              Object.entries(credentials.accounts).map(([key, account]) => (
                                <SelectItem key={key} value={key}>
                                  {account.name} ({key})
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setOrgDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveOrg} disabled={saving}>
                        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {editingOrg ? "Update" : "Add"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {credentials &&
                    Object.entries(credentials.org_mapping).map(([org, accountKey]) => (
                      <TableRow key={org}>
                        <TableCell className="font-mono">{org}</TableCell>
                        <TableCell>
                          {credentials.accounts[accountKey]?.name || accountKey}
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({accountKey})
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditOrg(org, accountKey)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteOrg(org)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Bulk Generate Credentials */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FolderKey className="h-5 w-5" />
                    Project Credentials
                  </CardTitle>
                  <CardDescription>
                    Generate .envrc and cli.sh files for existing projects
                  </CardDescription>
                </div>
                <Button
                  onClick={handleBulkGenerate}
                  disabled={selectedProjects.size === 0 || bulkGenerating}
                >
                  {bulkGenerating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Generate for Selected ({selectedProjects.size})
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {projects && projects.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <input
                          type="checkbox"
                          checked={projects.length > 0 && selectedProjects.size === projects.length}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                      </TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Org</TableHead>
                      <TableHead>Account (Vercel)</TableHead>
                      <TableHead>Convex Keys</TableHead>
                      <TableHead>Linear Key</TableHead>
                      <TableHead>Neon Key</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((project) => {
                      const account = getProjectAccountInfo(project.org);
                      const status = projectStatuses[project.id];
                      const hasVercelToken = account && account.vercel_token;
                      const convexKeys = credentials?.convex_keys?.[project.repoName];
                      const hasConvexKeys = convexKeys?.production || convexKeys?.preview || convexKeys?.dev;

                      const linearSlug = project.linearSlug;
                      const linearKey = linearSlug ? credentials?.linear_keys?.[linearSlug] : undefined;

                      const neonOrgSlug = project.neonOrgSlug;
                      const neonKey = neonOrgSlug ? credentials?.neon_keys?.[neonOrgSlug] : undefined;

                      return (
                        <TableRow key={project.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedProjects.has(project.id)}
                              onChange={() => toggleProjectSelection(project.id)}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{project.projectName}</div>
                              <div className="text-xs text-muted-foreground">
                                {project.repoName}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{project.org}</TableCell>
                          <TableCell>
                            {account ? (
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">{account.name}</Badge>
                                {!hasVercelToken && (
                                  <span className="text-xs text-yellow-600">No Vercel token</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                No mapping
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {hasConvexKeys ? (
                                <div className="flex gap-1">
                                  {convexKeys?.production && <Badge variant="outline" className="text-xs">prod</Badge>}
                                  {convexKeys?.preview && <Badge variant="outline" className="text-xs">preview</Badge>}
                                  {convexKeys?.dev && <Badge variant="outline" className="text-xs">dev</Badge>}
                                </div>
                              ) : (
                                <span className="text-xs text-yellow-600">Not set</span>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => openEditConvexKeys(project.repoName)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            {linearSlug ? (
                              <div className="flex items-center gap-2">
                                {linearKey ? (
                                  <Badge variant="outline" className="text-xs font-mono">{linearSlug}</Badge>
                                ) : (
                                  <span className="text-xs text-yellow-600">Not set</span>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => openEditLinearKey(project.repoName, linearSlug)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                {linearKey && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => handleDeleteLinearKey(linearSlug)}
                                  >
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">No slug</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {neonOrgSlug ? (
                              <div className="flex items-center gap-2">
                                {neonKey ? (
                                  <Badge variant="outline" className="text-xs font-mono">{neonOrgSlug}</Badge>
                                ) : (
                                  <span className="text-xs text-yellow-600">Not set</span>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => openEditNeonKey(project.repoName, neonOrgSlug)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                {neonKey && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => handleDeleteNeonKey(neonOrgSlug)}
                                  >
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">No slug</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {status?.status === "generating" && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Generating...
                              </div>
                            )}
                            {status?.status === "success" && (
                              <div className="flex items-center gap-1 text-xs text-green-600">
                                <Check className="h-3 w-3" />
                                Generated
                              </div>
                            )}
                            {status?.status === "error" && (
                              <div className="flex items-center gap-1 text-xs text-red-600">
                                <XCircle className="h-3 w-3" />
                                {status.message}
                              </div>
                            )}
                            {status?.status === "no-credentials" && (
                              <div className="flex items-center gap-1 text-xs text-yellow-600">
                                <AlertCircle className="h-3 w-3" />
                                {status.message}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No projects found. Create a project first.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Delete Account Confirmation Dialog */}
        <Dialog open={!!deleteAccountKey} onOpenChange={() => setDeleteAccountKey(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Account</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the account &quot;{deleteAccountKey}&quot;? This will
                also remove any org mappings that use this account.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteAccountKey(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteAccount} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Org Confirmation Dialog */}
        <Dialog open={!!deleteOrg} onOpenChange={() => setDeleteOrg(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Org Mapping</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove the mapping for &quot;{deleteOrg}&quot;?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOrg(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteOrg} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Convex Keys Dialog */}
        <Dialog open={convexKeysDialogOpen} onOpenChange={(open) => {
          setConvexKeysDialogOpen(open);
          if (!open) resetConvexKeysForm();
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Convex Deploy Keys</DialogTitle>
              <DialogDescription>
                Set Convex deploy keys for {editingConvexKeysRepo}. Leave fields empty to keep existing values.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="convexProd">Production Key</Label>
                <Input
                  id="convexProd"
                  type="password"
                  placeholder="(unchanged)"
                  value={convexKeysForm.production}
                  onChange={(e) =>
                    setConvexKeysForm({ ...convexKeysForm, production: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">Used for production deployments</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="convexPreview">Preview Key</Label>
                <Input
                  id="convexPreview"
                  type="password"
                  placeholder="(unchanged)"
                  value={convexKeysForm.preview}
                  onChange={(e) =>
                    setConvexKeysForm({ ...convexKeysForm, preview: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">Used for preview/staging deployments</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="convexDev">Dev Key</Label>
                <Input
                  id="convexDev"
                  type="password"
                  placeholder="(unchanged)"
                  value={convexKeysForm.dev}
                  onChange={(e) =>
                    setConvexKeysForm({ ...convexKeysForm, dev: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">Used for local development</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConvexKeysDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveConvexKeys} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Keys
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Linear Key Dialog */}
        <Dialog open={linearKeyDialogOpen} onOpenChange={(open) => {
          setLinearKeyDialogOpen(open);
          if (!open) { setLinearKeyForm({ key: "" }); setEditingLinearKeyProject(null); }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Linear API Key</DialogTitle>
              <DialogDescription>
                Set the Linear API key for workspace{" "}
                <span className="font-mono font-medium">{editingLinearKeyProject?.linearSlug}</span>.
                Leave empty to keep the existing value.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="linearKey">API Key</Label>
                <Input
                  id="linearKey"
                  type="password"
                  placeholder="lin_api_..."
                  value={linearKeyForm.key}
                  onChange={(e) => setLinearKeyForm({ key: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Generate from Linear → Settings → Security &amp; Access → Personal API keys
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLinearKeyDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveLinearKey} disabled={saving || !linearKeyForm.key}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Key
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Neon Key Dialog */}
        <Dialog open={neonKeyDialogOpen} onOpenChange={(open) => {
          setNeonKeyDialogOpen(open);
          if (!open) { setNeonKeyForm({ key: "" }); setEditingNeonKeyProject(null); }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neon API Key</DialogTitle>
              <DialogDescription>
                Set the Neon API key for org slug{" "}
                <span className="font-mono font-medium">{editingNeonKeyProject?.neonOrgSlug}</span>.
                Leave empty to keep the existing value. Used as <code>NEON_API_KEY</code> by the Neon CLI.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="neonKey">API Key</Label>
                <Input
                  id="neonKey"
                  type="password"
                  placeholder="neon_..."
                  value={neonKeyForm.key}
                  onChange={(e) => setNeonKeyForm({ key: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Create in Neon Console → Settings → API keys (org-scoped recommended).
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNeonKeyDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveNeonKey} disabled={saving || !neonKeyForm.key}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Key
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
