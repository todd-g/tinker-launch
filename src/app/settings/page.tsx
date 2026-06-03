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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { useDbQuery, useDbMutation } from "@/hooks/use-db";
import { useState, useEffect } from "react";
import { Save, RotateCcw, Key, ChevronRight, FolderSearch, Folders, Building2 } from "lucide-react";
import Link from "next/link";

const DEFAULT_TECH_STACK = `# Tech Stack

## Frontend
- **Framework**: Next.js (latest stable, App Router)
- **Styling**: Tailwind CSS 4
- **Components**: shadcn/ui with sidebar-08 layout

## Backend
- **Database & Functions**: Convex
- **Real-time**: Convex subscriptions

## Infrastructure
- **Hosting**: Vercel
- **CLI Tools**: Vercel CLI, Convex CLI

## Development Setup
1. \`npm install\`
2. \`npx convex dev\` (in separate terminal)
3. \`npm run dev\`
4. Open \`http://localhost:{port}\`
`;

const DEFAULT_CLAUDE_TEMPLATE = `# {projectName}

{description}

## Tech Stack
- Next.js (latest stable, App Router)
- Tailwind CSS 4 with shadcn/ui (sidebar-08 variant)
- Convex for database/backend
- Vercel for hosting

## Development
- Run \`npm run dev\` for Next.js dev server
- Run \`npx convex dev\` for Convex in development mode
- Local dev server runs on port {port}

## Deployments & Credentials

This project uses credential files managed by Tinker Launch. The \`.envrc\` file may contain any of:
- \`VERCEL_TOKEN\` — Vercel deploy token (always set if account is configured)
- \`CONVEX_DEPLOY_KEY\` / \`_PREVIEW\` / \`_DEV\` — Convex deploy keys (per-project)
- \`LINEAR_API_KEY\` — Linear GraphQL API key (per workspace slug)
- \`NEON_API_KEY\` — Neon CLI / API key (per Neon org slug)

**Using cli.sh (recommended for agents):**
\`\`\`bash
./cli.sh vercel              # Deploy to Vercel
./cli.sh npx convex deploy   # Deploy Convex functions
./cli.sh neon projects list  # Neon CLI — reads NEON_API_KEY automatically (no login needed)
./cli.sh neon branches create --project-id <id> --name feature/x
./cli.sh vercel whoami       # Check which Vercel account is active
\`\`\`

**If direnv is installed:**
The credentials auto-load when you \`cd\` into this directory. You can then run commands directly:
\`\`\`bash
vercel
npx convex deploy
neon projects list
\`\`\`

**Important:** Never commit \`.envrc\` - it contains sensitive tokens and is gitignored.
`;

export default function SettingsPage() {
  const { data: settingsData } = useDbQuery<{ success: boolean; settings: Record<string, unknown> }>("/api/db/settings");
  const settings = settingsData?.settings;
  const { mutate: setSettingApi } = useDbMutation("/api/db/settings");

  const [techStack, setTechStack] = useState(DEFAULT_TECH_STACK);
  const [claudeTemplate, setClaudeTemplate] = useState(DEFAULT_CLAUDE_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      if (settings.techStackTemplate) {
        setTechStack(settings.techStackTemplate as string);
      }
      if (settings.claudeTemplate) {
        setClaudeTemplate(settings.claudeTemplate as string);
      }
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    await setSettingApi({ key: "techStackTemplate", value: techStack });
    await setSettingApi({ key: "claudeTemplate", value: claudeTemplate });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleResetTechStack = () => {
    setTechStack(DEFAULT_TECH_STACK);
  };

  const handleResetClaude = () => {
    setClaudeTemplate(DEFAULT_CLAUDE_TEMPLATE);
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>Settings</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
          </Button>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {/* Projects Link Card */}
          <Link href="/settings/projects">
            <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-lg">
                      <Folders className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Projects</CardTitle>
                      <CardDescription>
                        Edit URLs, aliases, Linear slugs, and archive projects
                      </CardDescription>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>
          </Link>

          {/* Orgs Link Card */}
          <Link href="/settings/orgs">
            <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-lg">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Orgs</CardTitle>
                      <CardDescription>
                        Display names, Slack workspace, and Chrome profile mappings per org
                      </CardDescription>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>
          </Link>

          {/* Credentials Link Card */}
          <Link href="/settings/credentials">
            <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-lg">
                      <Key className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Credentials</CardTitle>
                      <CardDescription>
                        Manage Vercel/Convex accounts and org mappings
                      </CardDescription>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>
          </Link>

          {/* Import Projects Link Card */}
          <Link href="/settings/import">
            <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-lg">
                      <FolderSearch className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Import Projects</CardTitle>
                      <CardDescription>
                        Scan and import existing projects from your projects directory
                      </CardDescription>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>
          </Link>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>TECH_STACK.md Template</CardTitle>
                  <CardDescription>
                    Default tech stack documentation for new projects
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleResetTechStack}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                value={techStack}
                onChange={(e) => setTechStack(e.target.value)}
                className="font-mono text-sm min-h-[300px]"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Available variables: <code>{"{port}"}</code>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>CLAUDE.md Template</CardTitle>
                  <CardDescription>
                    Default Claude context file for new projects
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleResetClaude}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                value={claudeTemplate}
                onChange={(e) => setClaudeTemplate(e.target.value)}
                className="font-mono text-sm min-h-[300px]"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Available variables: <code>{"{projectName}"}</code>,{" "}
                <code>{"{description}"}</code>, <code>{"{port}"}</code>
              </p>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
