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
import { useState, useEffect, useCallback } from "react";
import type { DbOrgSettings } from "@/lib/db";
import { Loader2, Pencil } from "lucide-react";

interface Credentials {
  accounts: Record<string, { name: string; vercel_token: string }>;
  org_mapping: Record<string, string>;
}

interface OrgRow extends Partial<DbOrgSettings> {
  org: string;
  accountKey?: string;
  accountName?: string;
}

interface EditForm {
  displayName: string;
  slackWorkspace: string;
  chromeProfile: string;
}

export default function OrgsSettingsPage() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [orgSettingsMap, setOrgSettingsMap] = useState<Record<string, DbOrgSettings>>({});
  const [loading, setLoading] = useState(true);
  const [editingOrg, setEditingOrg] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ displayName: "", slackWorkspace: "", chromeProfile: "" });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [credRes, orgsRes] = await Promise.all([
        fetch("/api/credentials"),
        fetch("/api/db/orgs"),
      ]);
      const credData = await credRes.json();
      const orgsData = await orgsRes.json();
      if (credData.success) setCredentials(credData.credentials);
      if (orgsData.success) {
        const map: Record<string, DbOrgSettings> = {};
        for (const o of orgsData.orgs as DbOrgSettings[]) {
          map[o.org] = o;
        }
        setOrgSettingsMap(map);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build unified rows: all orgs from credentials + any that only exist in orgSettings
  const orgs: OrgRow[] = [];
  if (credentials) {
    for (const [orgKey, accountKey] of Object.entries(credentials.org_mapping)) {
      const accountName = credentials.accounts[accountKey]?.name;
      const { org: _o, ...rest } = orgSettingsMap[orgKey] ?? {};
      orgs.push({ org: orgKey, accountKey, accountName, ...rest });
    }
    // Also surface any org settings not in credentials (edge case)
    for (const orgKey of Object.keys(orgSettingsMap)) {
      if (!credentials.org_mapping[orgKey]) {
        const { org: _o, ...rest } = orgSettingsMap[orgKey];
        orgs.push({ org: orgKey, ...rest });
      }
    }
  }

  const openEdit = (row: OrgRow) => {
    setEditingOrg(row.org);
    setEditForm({
      displayName: row.displayName ?? "",
      slackWorkspace: row.slackWorkspace ?? "",
      chromeProfile: row.chromeProfile ?? "",
    });
  };

  const handleSave = async () => {
    if (!editingOrg) return;
    setSaving(true);
    try {
      await fetch("/api/db/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upsert", org: editingOrg, ...editForm }),
      });
      setEditingOrg(null);
      await fetchData();
    } finally {
      setSaving(false);
    }
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
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/settings">Settings</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Orgs</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              Extra metadata per org for activity matching. Accounts and org→account mappings are managed in{" "}
              <a href="/settings/credentials" className="text-primary hover:underline">Credentials</a>.
            </p>
          </div>

          {orgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No orgs configured yet. Add org mappings in{" "}
              <a href="/settings/credentials" className="text-primary hover:underline">Credentials</a>.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Org</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Slack Workspace</TableHead>
                  <TableHead>Chrome Profile</TableHead>
                  <TableHead className="w-[60px]">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((row) => (
                  <TableRow key={row.org}>
                    <TableCell>
                      <code className="text-sm font-mono">{row.org}</code>
                    </TableCell>
                    <TableCell>
                      {row.accountName ? (
                        <Badge variant="secondary">{row.accountName}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.displayName || <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {row.slackWorkspace ? (
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{row.slackWorkspace}</code>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.chromeProfile ? (
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{row.chromeProfile}</code>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <Dialog open={!!editingOrg} onOpenChange={(open) => { if (!open) setEditingOrg(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Org — {editingOrg}</DialogTitle>
              <DialogDescription>
                Set display name and activity-matching metadata for this org.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  placeholder="e.g., Minima Group"
                  value={editForm.displayName}
                  onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slackWorkspace">Slack Workspace Name</Label>
                <Input
                  id="slackWorkspace"
                  placeholder="e.g., Minima"
                  value={editForm.slackWorkspace}
                  onChange={(e) => setEditForm({ ...editForm, slackWorkspace: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Matches window titles like &quot;Slack — Minima&quot; to this org
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="chromeProfile">Chrome Profile Name</Label>
                <Input
                  id="chromeProfile"
                  placeholder="e.g., Todd (ToddMinima)"
                  value={editForm.chromeProfile}
                  onChange={(e) => setEditForm({ ...editForm, chromeProfile: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Maps a Chrome profile to this org for browser activity tracking
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingOrg(null)}>Cancel</Button>
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
