"use client";

import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Bot, Info, Sparkles, Terminal } from "lucide-react";

function AutoBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20">
      <Sparkles className="h-3 w-3" />
      Automatic
    </span>
  );
}

function Callout({
  children,
  variant = "info",
}: {
  children: React.ReactNode;
  variant?: "info" | "tip" | "auto" | "agent";
}) {
  const styles = {
    info: "border-blue-500/40 bg-blue-500/5 text-blue-900 dark:text-blue-200",
    tip: "border-amber-500/40 bg-amber-500/5 text-amber-900 dark:text-amber-200",
    auto: "border-emerald-500/40 bg-emerald-500/5 text-emerald-900 dark:text-emerald-200",
    agent: "border-violet-500/40 bg-violet-500/5 text-violet-900 dark:text-violet-200",
  };
  const icons = {
    info: <Info className="mt-0.5 h-4 w-4 shrink-0" />,
    tip: <Terminal className="mt-0.5 h-4 w-4 shrink-0" />,
    auto: <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />,
    agent: <Bot className="mt-0.5 h-4 w-4 shrink-0" />,
  };

  return (
    <div className={`flex gap-3 rounded-lg border-l-4 px-4 py-3 text-sm ${styles[variant]}`}>
      {icons[variant]}
      <div>{children}</div>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-sm leading-relaxed text-zinc-300 dark:bg-zinc-900">
      {children}
    </pre>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 text-[0.8125rem]">{children}</code>
  );
}

export default function DocsPage() {
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
                <BreadcrumbPage>Documentation</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 flex-col p-4 pt-0">
          <article className="mx-auto w-full max-w-3xl space-y-10 pb-16">
            {/* Title */}
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Tinker Launch Guide</h1>
              <p className="mt-2 text-lg text-muted-foreground">
                Everything you need to know about creating, managing, and monitoring projects.
              </p>
            </div>

            {/* Table of Contents */}
            <nav className="rounded-lg border bg-muted/30 p-4">
              <p className="mb-2 text-sm font-semibold">On this page</p>
              <ul className="columns-2 gap-x-8 text-sm text-muted-foreground space-y-1">
                <li><a href="#getting-started" className="hover:text-foreground hover:underline">Getting Started</a></li>
                <li><a href="#claude-code-setup" className="hover:text-foreground hover:underline">Claude Code Setup Guide</a></li>
                <li><a href="#creating-a-project" className="hover:text-foreground hover:underline">Creating a Project</a></li>
                <li><a href="#tinker-yaml" className="hover:text-foreground hover:underline">.tinker.yaml Config</a></li>
                <li><a href="#credentials" className="hover:text-foreground hover:underline">Credentials System</a></li>
                <li><a href="#port-scanner" className="hover:text-foreground hover:underline">Port Scanner</a></li>
                <li><a href="#importing-projects" className="hover:text-foreground hover:underline">Importing Existing Projects</a></li>
                <li><a href="#activity-tracking" className="hover:text-foreground hover:underline">Activity Tracking</a></li>
              </ul>
            </nav>

            <Separator />

            {/* ── Getting Started ── */}
            <section id="getting-started" className="space-y-4 scroll-mt-20">
              <h2 className="text-2xl font-semibold tracking-tight">Getting Started</h2>

              <h3 className="text-lg font-medium">Prerequisites</h3>
              <ul className="list-disc space-y-1 pl-6 text-[0.9375rem] text-muted-foreground">
                <li>Node.js (latest LTS)</li>
                <li>GitHub CLI &mdash; <InlineCode>gh</InlineCode> (used for repo creation)</li>
                <li>Python 3 (for optional window tracking daemon)</li>
              </ul>

              <h3 className="text-lg font-medium">Setup</h3>
              <CodeBlock>{`git clone <repo-url> && cd tinker-launch
npm install
npm run dev             # Start Next.js on port 3001`}</CodeBlock>

              <p className="text-[0.9375rem] text-muted-foreground">
                Open <InlineCode>http://localhost:3001</InlineCode> to access the dashboard.
              </p>

              <h3 className="text-lg font-medium">First-time configuration</h3>
              <p className="text-[0.9375rem] text-muted-foreground">
                Head to <strong>Settings &rarr; Credentials</strong> and add at least one Vercel
                account and an org mapping. This connects your GitHub orgs to Vercel tokens so
                Tinker Launch can inject the right credentials into every project it creates.
              </p>

              <Callout variant="tip">
                Set the <InlineCode>PROJECTS_DIR</InlineCode> environment variable to
                control where new projects are created. Default
                is <InlineCode>~/Documents/GitHub</InlineCode>.
              </Callout>
            </section>

            <Separator />

            {/* ── Claude Code Setup Guide ── */}
            <section id="claude-code-setup" className="space-y-4 scroll-mt-20">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-semibold tracking-tight">Claude Code Setup Guide</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-0.5 text-xs font-medium text-violet-600 dark:text-violet-400 ring-1 ring-violet-500/20">
                  <Bot className="h-3 w-3" />
                  For Claude Code
                </span>
              </div>

              <Callout variant="agent">
                <p className="font-medium mb-1">This section is written for Claude Code.</p>
                <p>
                  If you&apos;re a new user, paste the following into Claude Code:
                  &quot;Set up Tinker Launch for me &mdash; follow the Claude Code Setup Guide
                  in the docs page.&quot; Claude will walk you through each step interactively.
                </p>
              </Callout>

              <p className="text-[0.9375rem] text-muted-foreground">
                The steps below are instructions for Claude Code to follow when setting up
                Tinker Launch on a new machine. Each step includes what to check, what to
                ask the user, and where to write the result. Work through them in order.
              </p>

              {/* Step 1 */}
              <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <h3 className="text-lg font-medium">Step 1: Check prerequisites</h3>
                <p className="text-[0.9375rem] text-muted-foreground">
                  Run these commands and report what&apos;s missing:
                </p>
                <CodeBlock>{`node --version        # Need Node.js LTS
gh --version          # Need GitHub CLI
gh auth status        # Need authenticated GitHub session`}</CodeBlock>
                <Callout variant="agent">
                  <p><strong>If Node.js is missing:</strong> Tell the user to install it from nodejs.org or via <InlineCode>brew install node</InlineCode>.</p>
                  <p className="mt-1"><strong>If <InlineCode>gh</InlineCode> is missing:</strong> Run <InlineCode>brew install gh</InlineCode>, then <InlineCode>gh auth login</InlineCode> and walk the user through the browser auth flow.</p>
                  <p className="mt-1"><strong>If <InlineCode>gh auth status</InlineCode> fails:</strong> Run <InlineCode>gh auth login</InlineCode> and have the user authenticate.</p>
                </Callout>
              </div>

              {/* Step 2 */}
              <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <h3 className="text-lg font-medium">Step 2: Install dependencies</h3>
                <CodeBlock>{`cd <tinker-launch-directory>
npm install`}</CodeBlock>
              </div>

              {/* Step 3 */}
              <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <h3 className="text-lg font-medium">Step 3: Verify the database</h3>
                <p className="text-[0.9375rem] text-muted-foreground">
                  Tinker Launch uses a local SQLite database at <InlineCode>~/.tinker-launch/tinker.db</InlineCode>.
                  It auto-creates on first run &mdash; no setup needed. Start the dev server and
                  visit the dashboard to confirm everything loads.
                </p>
              </div>

              {/* Step 4 */}
              <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <h3 className="text-lg font-medium">Step 4: Start the dev server</h3>
                <CodeBlock>{`npm run dev`}</CodeBlock>
                <p className="text-[0.9375rem] text-muted-foreground">
                  Tinker Launch runs on <InlineCode>http://localhost:3001</InlineCode>.
                  The user can open it now to verify the dashboard loads.
                </p>
              </div>

              {/* Step 5 */}
              <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <h3 className="text-lg font-medium">Step 5: Configure credentials</h3>
                <p className="text-[0.9375rem] text-muted-foreground">
                  This is the main interactive step. You need to build
                  the <InlineCode>~/.tinker-launch/credentials.yaml</InlineCode> file.
                  Ask the user these questions one at a time:
                </p>

                <div className="space-y-3 pl-4 border-l-2 border-violet-500/30">
                  <div>
                    <p className="text-sm font-medium">5a. Ask: &quot;What&apos;s your GitHub username?&quot;</p>
                    <p className="text-sm text-muted-foreground">
                      You can pre-fill this by running <InlineCode>gh api user --jq .login</InlineCode>.
                      Confirm it with the user.
                    </p>
                  </div>

                  <div>
                    <p className="text-sm font-medium">5b. Ask: &quot;Do you have any GitHub organizations besides your personal account?&quot;</p>
                    <p className="text-sm text-muted-foreground">
                      You can list them with <InlineCode>gh api user/orgs --jq &apos;.[].login&apos;</InlineCode>.
                      Note which ones the user wants to use with Tinker Launch.
                    </p>
                  </div>

                  <div>
                    <p className="text-sm font-medium">5c. Ask: &quot;Do you use one Vercel account for everything, or different accounts for different orgs?&quot;</p>
                    <p className="text-sm text-muted-foreground">
                      Most people have one. If they have multiple, you&apos;ll create multiple account
                      entries and map orgs accordingly.
                    </p>
                  </div>

                  <div>
                    <p className="text-sm font-medium">5d. Ask: &quot;What should we name this account?&quot;</p>
                    <p className="text-sm text-muted-foreground">
                      Suggest &quot;personal&quot; for a single account, or the Vercel team name for
                      multi-account setups. This becomes the account key.
                    </p>
                  </div>

                  <div>
                    <p className="text-sm font-medium">5e. Ask: &quot;Please provide your Vercel API token.&quot;</p>
                    <p className="text-sm text-muted-foreground">
                      Tell the user: &quot;Go to vercel.com/account/tokens, create a new token
                      with full access, and paste it here.&quot; This value goes
                      in <InlineCode>accounts.&lt;key&gt;.vercel_token</InlineCode>.
                    </p>
                  </div>
                </div>

                <p className="text-[0.9375rem] text-muted-foreground">
                  Once you have the answers, create the directory and write the file:
                </p>
                <CodeBlock>{`mkdir -p ~/.tinker-launch`}</CodeBlock>
                <p className="text-[0.9375rem] text-muted-foreground">
                  Write <InlineCode>~/.tinker-launch/credentials.yaml</InlineCode> with this structure:
                </p>
                <CodeBlock>{`accounts:
  <account-key>:
    name: "<display-name>"
    vercel_token: "<token>"

org_mapping:
  <github-username>: <account-key>
  <github-org>: <account-key>

convex_keys: {}`}</CodeBlock>

                <Callout variant="agent">
                  <p><strong>Example</strong> for a user named &quot;alice&quot; with one personal account
                  and a work org &quot;acme-corp&quot;:</p>
                </Callout>
                <CodeBlock>{`accounts:
  personal:
    name: "Alice's Account"
    vercel_token: "MhQZlI96lZbLT..."

org_mapping:
  alice: personal
  acme-corp: personal

convex_keys: {}`}</CodeBlock>
              </div>

              {/* Step 6 */}
              <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <h3 className="text-lg font-medium">Step 6: Set up direnv (optional but recommended)</h3>
                <p className="text-[0.9375rem] text-muted-foreground">
                  Check if direnv is installed:
                </p>
                <CodeBlock>{`direnv --version`}</CodeBlock>
                <Callout variant="agent">
                  <p><strong>If missing</strong>, ask: &quot;Would you like to install direnv? It
                  auto-loads project credentials when you cd into a project directory.&quot;</p>
                  <p className="mt-1">If yes:</p>
                </Callout>
                <CodeBlock>{`brew install direnv`}</CodeBlock>
                <p className="text-[0.9375rem] text-muted-foreground">
                  Then add the hook to their shell config. Check which shell they use
                  with <InlineCode>echo $SHELL</InlineCode>, then append:
                </p>
                <CodeBlock>{`# For zsh (~/.zshrc):
eval "$(direnv hook zsh)"

# For bash (~/.bashrc):
eval "$(direnv hook bash)"`}</CodeBlock>
              </div>

              {/* Step 7 */}
              <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <h3 className="text-lg font-medium">Step 7: Configure projects directory (optional)</h3>
                <Callout variant="agent">
                  <p>Ask: &quot;Where do you keep your project repos? The default
                  is <InlineCode>~/Documents/GitHub</InlineCode>. Is that right, or do you
                  use a different directory?&quot;</p>
                </Callout>
                <p className="text-[0.9375rem] text-muted-foreground">
                  If they use a different path, set <InlineCode>PROJECTS_DIR</InlineCode> in
                  the Tinker Launch <InlineCode>.env.local</InlineCode> file:
                </p>
                <CodeBlock>{`# Add to tinker-launch/.env.local
PROJECTS_DIR=/Users/<username>/<their-projects-folder>`}</CodeBlock>
                <p className="text-[0.9375rem] text-muted-foreground">
                  If they use <InlineCode>~/Documents/GitHub</InlineCode>, no change needed &mdash; that&apos;s
                  the default.
                </p>
              </div>

              {/* Step 8 */}
              <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <h3 className="text-lg font-medium">Step 8: Import existing projects (optional)</h3>
                <Callout variant="agent">
                  <p>Ask: &quot;Do you have existing projects you&apos;d like to add to the
                  dashboard? I can open the import page for you.&quot;</p>
                </Callout>
                <p className="text-[0.9375rem] text-muted-foreground">
                  If yes, direct the user to <InlineCode>http://localhost:3001/settings/import</InlineCode>.
                  The importer will scan their projects directory, detect git repos, and let them
                  select which ones to register. After import, they can add Convex deploy keys
                  for each project.
                </p>
              </div>

              {/* Step 9 */}
              <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <h3 className="text-lg font-medium">Step 9: Verify everything works</h3>
                <p className="text-[0.9375rem] text-muted-foreground">
                  Run a quick verification:
                </p>
                <CodeBlock>{`# Credentials file exists and has content
cat ~/.tinker-launch/credentials.yaml

# GitHub CLI is authenticated
gh auth status

# Tinker Launch is running
curl -s http://localhost:3001 | head -c 100`}</CodeBlock>
                <p className="text-[0.9375rem] text-muted-foreground">
                  Tell the user: &quot;You&apos;re all set. Open{" "}
                  <InlineCode>http://localhost:3001</InlineCode> and try creating your first
                  project with the New Project button in the sidebar.&quot;
                </p>
              </div>
            </section>

            <Separator />

            {/* ── Creating a Project ── */}
            <section id="creating-a-project" className="space-y-4 scroll-mt-20">
              <h2 className="text-2xl font-semibold tracking-tight">Creating a Project</h2>
              <p className="text-[0.9375rem] text-muted-foreground">
                Click <strong>New Project</strong> in the sidebar. Fill in a repo name,
                project name, org, and description. Tinker Launch handles the rest.
              </p>

              <Callout variant="auto">
                <p className="font-medium mb-1">What happens automatically</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>Creates a private GitHub repo via <InlineCode>gh</InlineCode></li>
                  <li>Scaffolds a local project directory with starter files</li>
                  <li>Runs <InlineCode>git init</InlineCode> and adds the GitHub remote</li>
                  <li>Assigns the next available port (auto-increments from the highest registered port)</li>
                </ul>
              </Callout>

              <h3 className="text-lg font-medium">Auto-generated files</h3>
              <p className="text-[0.9375rem] text-muted-foreground">
                Every new project gets these files created in its root directory:
              </p>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-2.5 text-left font-medium">File</th>
                      <th className="px-4 py-2.5 text-left font-medium">Purpose</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b">
                      <td className="px-4 py-2.5"><InlineCode>.tinker.yaml</InlineCode></td>
                      <td className="px-4 py-2.5">Project config &mdash; name, port, org, repo. Used by the port scanner to identify the project.</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-4 py-2.5"><InlineCode>CLAUDE.md</InlineCode></td>
                      <td className="px-4 py-2.5">AI context file with tech stack, dev commands, and deployment instructions.</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-4 py-2.5"><InlineCode>TECH_STACK.md</InlineCode></td>
                      <td className="px-4 py-2.5">Detailed tech stack breakdown (frontend, backend, infra).</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5"><InlineCode>.gitignore</InlineCode></td>
                      <td className="px-4 py-2.5">Standard ignores for Node, Next.js, Convex, environment files, and IDE artifacts.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-lg font-medium">Repo name formatting</h3>
              <p className="text-[0.9375rem] text-muted-foreground">
                The repo name field automatically converts your input to kebab-case
                and strips special characters as you type, so &quot;My Cool App&quot;
                becomes <InlineCode>my-cool-app</InlineCode>.
              </p>

              <h3 className="text-lg font-medium">Credential generation</h3>
              <p className="text-[0.9375rem] text-muted-foreground">
                If the selected org has a Vercel token configured, a &quot;Generate
                credentials&quot; checkbox appears. When enabled, Tinker Launch will
                also create <InlineCode>.envrc</InlineCode> and <InlineCode>cli.sh</InlineCode> in
                the project (see the <a href="#credentials" className="underline underline-offset-2 hover:text-foreground">Credentials</a> section).
              </p>
            </section>

            <Separator />

            {/* ── .tinker.yaml ── */}
            <section id="tinker-yaml" className="space-y-4 scroll-mt-20">
              <h2 className="text-2xl font-semibold tracking-tight font-mono">.tinker.yaml</h2>
              <p className="text-[0.9375rem] text-muted-foreground">
                This is the project configuration file that lives in the root of every
                Tinker Launch project. The port scanner, terminal color sync, and
                favicon display all read from it.
              </p>

              <Callout variant="auto">
                This file is <strong>auto-generated</strong> when you create a new project
                through the dashboard. You only need to create it manually for projects
                that weren&apos;t created by Tinker Launch.
              </Callout>

              <h3 className="text-lg font-medium">Full example</h3>
              <CodeBlock>{`name: My App
description: A Next.js dashboard for widgets
port: 3002
org: my-github-org
repo: my-app

# Multi-port (use instead of single "port" field)
ports:
  - port: 3002
    name: Frontend
    path: /app
  - port: 3003
    name: API
    path: /api

# Terminal tab colors (macOS Terminal.app)
terminal:
  background: "hsl(240, 50%, 10%)"   # fallback
  dark: "hsl(240, 50%, 10%)"         # dark mode
  light: "hsl(240, 40%, 70%)"        # light mode`}</CodeBlock>

              <h3 className="text-lg font-medium">Field reference</h3>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-2.5 text-left font-medium">Field</th>
                      <th className="px-4 py-2.5 text-left font-medium">Type</th>
                      <th className="px-4 py-2.5 text-left font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b">
                      <td className="px-4 py-2.5"><InlineCode>name</InlineCode></td>
                      <td className="px-4 py-2.5">string</td>
                      <td className="px-4 py-2.5">Display name shown in the port scanner and dashboard</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-4 py-2.5"><InlineCode>description</InlineCode></td>
                      <td className="px-4 py-2.5">string</td>
                      <td className="px-4 py-2.5">Brief project description</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-4 py-2.5"><InlineCode>port</InlineCode></td>
                      <td className="px-4 py-2.5">number</td>
                      <td className="px-4 py-2.5">Primary dev server port</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-4 py-2.5"><InlineCode>ports</InlineCode></td>
                      <td className="px-4 py-2.5">array</td>
                      <td className="px-4 py-2.5">Alternative to <InlineCode>port</InlineCode> for multi-server projects. Each entry has <InlineCode>port</InlineCode>, <InlineCode>name</InlineCode>, and <InlineCode>path</InlineCode>.</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-4 py-2.5"><InlineCode>org</InlineCode></td>
                      <td className="px-4 py-2.5">string</td>
                      <td className="px-4 py-2.5">GitHub org or username</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-4 py-2.5"><InlineCode>repo</InlineCode></td>
                      <td className="px-4 py-2.5">string</td>
                      <td className="px-4 py-2.5">GitHub repository name</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5"><InlineCode>terminal</InlineCode></td>
                      <td className="px-4 py-2.5">object</td>
                      <td className="px-4 py-2.5">Terminal.app colors: <InlineCode>background</InlineCode> (fallback), <InlineCode>dark</InlineCode>, <InlineCode>light</InlineCode>. Accepts HSL, HSB, or hex.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-lg font-medium">Terminal colors <AutoBadge /></h3>
              <p className="text-[0.9375rem] text-muted-foreground">
                You can set terminal colors manually, but in most cases you don&apos;t need to.
                When the port scanner runs, it does the following for every project it finds:
              </p>
              <ol className="list-decimal space-y-1 pl-6 text-[0.9375rem] text-muted-foreground">
                <li>Checks if <InlineCode>terminal.dark</InlineCode> and <InlineCode>terminal.light</InlineCode> are already set &mdash; if so, uses them as-is.</li>
                <li>Otherwise, looks for a <InlineCode>terminal.background</InlineCode> fallback color and generates dark/light variants from it.</li>
                <li>If no terminal colors exist at all, scans the project&apos;s Tailwind config (<InlineCode>tailwind.config.js/ts/mjs</InlineCode>) and CSS globals for a brand, primary, or accent color.</li>
                <li>Generates dark and light HSL variants (dark: 15-22% lightness, light: 65-72% lightness) and <strong>writes them back</strong> into <InlineCode>.tinker.yaml</InlineCode>.</li>
              </ol>
              <p className="text-[0.9375rem] text-muted-foreground">
                Supported CSS variable names: <InlineCode>--primary</InlineCode>, <InlineCode>--brand</InlineCode>, <InlineCode>--accent</InlineCode>.
                The color parser handles HSL, HSB/HSV, hex, and oklch formats.
              </p>

              <h3 className="text-lg font-medium">Favicon detection <AutoBadge /></h3>
              <p className="text-[0.9375rem] text-muted-foreground">
                The port scanner searches each project for favicon files and displays
                them in the port list. It checks these locations in order:
              </p>
              <ul className="list-disc space-y-0.5 pl-6 text-[0.9375rem] text-muted-foreground">
                <li><InlineCode>public/favicon.ico</InlineCode>, <InlineCode>.png</InlineCode>, <InlineCode>.svg</InlineCode></li>
                <li><InlineCode>app/favicon.ico</InlineCode>, <InlineCode>app/icon.png</InlineCode>, <InlineCode>app/icon.svg</InlineCode></li>
                <li><InlineCode>src/app/icon.png</InlineCode>, <InlineCode>src/app/icon.svg</InlineCode></li>
                <li><InlineCode>static/favicon.ico</InlineCode> (Django/Python)</li>
                <li><InlineCode>assets/favicon.*</InlineCode>, root <InlineCode>favicon.ico</InlineCode></li>
              </ul>
            </section>

            <Separator />

            {/* ── Credentials ── */}
            <section id="credentials" className="space-y-4 scroll-mt-20">
              <h2 className="text-2xl font-semibold tracking-tight">Credentials System</h2>
              <p className="text-[0.9375rem] text-muted-foreground">
                Tinker Launch stores deployment credentials
                in <InlineCode>~/.tinker-launch/credentials.yaml</InlineCode> and
                manages them through <strong>Settings &rarr; Credentials</strong>.
                This file is created automatically on first use with an empty structure.
              </p>

              <h3 className="text-lg font-medium">Accounts</h3>
              <p className="text-[0.9375rem] text-muted-foreground">
                Each account has a display name and a Vercel API token. You can add
                multiple accounts to support different Vercel teams or personal projects.
              </p>

              <h3 className="text-lg font-medium">Org mappings</h3>
              <p className="text-[0.9375rem] text-muted-foreground">
                Map a GitHub org or username to one of your accounts. When you create
                a project under that org, Tinker Launch automatically selects the right
                Vercel token for deployments.
              </p>

              <h3 className="text-lg font-medium">Convex deploy keys</h3>
              <p className="text-[0.9375rem] text-muted-foreground">
                Each project can store up to three Convex deploy keys: production,
                preview, and dev. These are added during project import or from the
                credentials page, and are injected into the generated environment files.
              </p>

              <h3 className="text-lg font-medium">Generated environment files <AutoBadge /></h3>
              <p className="text-[0.9375rem] text-muted-foreground">
                When credentials are generated for a project (either at creation time
                or via the import flow), Tinker Launch creates two files in the project
                directory and updates two more:
              </p>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-2.5 text-left font-medium">File</th>
                      <th className="px-4 py-2.5 text-left font-medium">What it does</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b">
                      <td className="px-4 py-2.5"><InlineCode>.envrc</InlineCode></td>
                      <td className="px-4 py-2.5">
                        Exports <InlineCode>VERCEL_TOKEN</InlineCode> and any
                        configured <InlineCode>CONVEX_DEPLOY_KEY</InlineCode> variants.
                        Auto-loaded by <InlineCode>direnv</InlineCode> when you enter the directory.
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-4 py-2.5"><InlineCode>cli.sh</InlineCode></td>
                      <td className="px-4 py-2.5">
                        Bash wrapper that sources <InlineCode>.envrc</InlineCode> and
                        passes the Vercel token to the <InlineCode>vercel --token</InlineCode> flag.
                        Use as <InlineCode>./cli.sh vercel</InlineCode> or <InlineCode>./cli.sh npx convex deploy</InlineCode>.
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-4 py-2.5"><InlineCode>.gitignore</InlineCode></td>
                      <td className="px-4 py-2.5">
                        Updated to include <InlineCode>.envrc</InlineCode> so tokens are never committed.
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5"><InlineCode>CLAUDE.md</InlineCode></td>
                      <td className="px-4 py-2.5">
                        Updated with a &quot;Deployments &amp; Credentials&quot; section documenting
                        how to use <InlineCode>cli.sh</InlineCode> and <InlineCode>direnv</InlineCode>.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <Callout variant="info">
                Tokens are masked in the dashboard UI (showing first 4 + last 4 characters)
                so you can verify which token is configured without exposing the full value.
              </Callout>
            </section>

            <Separator />

            {/* ── Port Scanner ── */}
            <section id="port-scanner" className="space-y-4 scroll-mt-20">
              <h2 className="text-2xl font-semibold tracking-tight">Port Scanner</h2>
              <p className="text-[0.9375rem] text-muted-foreground">
                The port scanner runs automatically when you open the Ports page. It
                discovers active dev servers, identifies which project each one belongs
                to, and syncs Terminal.app colors. You can also trigger a manual scan
                with the &quot;Scan Ports&quot; button.
              </p>

              <h3 className="text-lg font-medium">Scanned port ranges</h3>
              <div className="flex flex-wrap gap-2">
                {[
                  { range: "3000–3100", label: "Next.js, Vite" },
                  { range: "4000–4100", label: "Various dev servers" },
                  { range: "5000–5200", label: "Vite, Flask" },
                  { range: "8000–8100", label: "Python, PHP" },
                ].map(({ range, label }) => (
                  <div
                    key={range}
                    className="rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                  >
                    <span className="font-mono font-medium">{range}</span>
                    <span className="ml-2 text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>

              <h3 className="text-lg font-medium">How identification works <AutoBadge /></h3>
              <p className="text-[0.9375rem] text-muted-foreground">
                For each listening port, the scanner:
              </p>
              <ol className="list-decimal space-y-1 pl-6 text-[0.9375rem] text-muted-foreground">
                <li>Uses <InlineCode>lsof</InlineCode> to find the process and its PID.</li>
                <li>Reads the process working directory.</li>
                <li>Looks for a <InlineCode>.tinker.yaml</InlineCode> in that directory to get the project name, org, repo, and terminal colors.</li>
                <li>Falls back to the SQLite port registry (projects created through the dashboard) if no config file is found.</li>
                <li>Searches for a favicon file to display alongside the project name.</li>
              </ol>
              <p className="text-[0.9375rem] text-muted-foreground">
                Ports without a matching project appear as &quot;Unidentified&quot; &mdash; add
                a <InlineCode>.tinker.yaml</InlineCode> to the project root to fix that.
              </p>

              <h3 className="text-lg font-medium">Terminal color sync <AutoBadge /></h3>
              <p className="text-[0.9375rem] text-muted-foreground">
                On macOS, the scanner iterates through every open Terminal.app window
                and tab, reads the working directory, and sets the tab background color
                based on the project&apos;s <InlineCode>.tinker.yaml</InlineCode> terminal
                colors. It detects whether macOS is in light or dark mode and picks
                the corresponding color.
              </p>

              <Callout variant="auto">
                If a project doesn&apos;t have terminal colors configured, the scanner
                automatically extracts your Tailwind brand color and generates appropriate
                dark/light variants. The generated colors are written back
                to <InlineCode>.tinker.yaml</InlineCode> so the detection only runs once.
              </Callout>

              <h3 className="text-lg font-medium">Status updates <AutoBadge /></h3>
              <p className="text-[0.9375rem] text-muted-foreground">
                After scanning, the dashboard updates the status of all registered
                projects in the database. Projects found on a scanned port are
                marked &quot;running&quot;; projects not found are marked &quot;stopped&quot;. You can
                also stop a running process directly from the port list.
              </p>

              <h3 className="text-lg font-medium">Project directory scanning</h3>
              <p className="text-[0.9375rem] text-muted-foreground">
                The scanner also builds a port registry by scanning known project
                directories for <InlineCode>.tinker.yaml</InlineCode> files. This allows
                it to identify projects even when the process working directory
                doesn&apos;t directly contain the config. Scanned directories:
              </p>
              <ul className="list-disc space-y-0.5 pl-6 text-[0.9375rem] text-muted-foreground">
                <li><InlineCode>$PROJECTS_DIR</InlineCode> (if set)</li>
                <li><InlineCode>~/Documents/GitHub</InlineCode></li>
                <li><InlineCode>~/Projects</InlineCode></li>
                <li><InlineCode>~/Code</InlineCode></li>
              </ul>
            </section>

            <Separator />

            {/* ── Importing Projects ── */}
            <section id="importing-projects" className="space-y-4 scroll-mt-20">
              <h2 className="text-2xl font-semibold tracking-tight">Importing Existing Projects</h2>
              <p className="text-[0.9375rem] text-muted-foreground">
                Go to <strong>Settings &rarr; Import Projects</strong> to register
                existing projects that weren&apos;t created through Tinker Launch.
              </p>

              <h3 className="text-lg font-medium">How it works <AutoBadge /></h3>
              <ol className="list-decimal space-y-1 pl-6 text-[0.9375rem] text-muted-foreground">
                <li>The importer scans your project directory (defaults to <InlineCode>~/Documents/GitHub</InlineCode>) for git repositories.</li>
                <li>For each repo, it reads the git remote to extract the org and repo name.</li>
                <li>If a <InlineCode>.tinker.yaml</InlineCode> exists, the importer uses its name, description, and port. Otherwise it derives a name from the folder.</li>
                <li>Ports are auto-assigned starting from the next available port.</li>
                <li>Select the projects you want, click import, and they&apos;re added to the dashboard.</li>
              </ol>

              <h3 className="text-lg font-medium">Post-import credentials</h3>
              <p className="text-[0.9375rem] text-muted-foreground">
                After importing, a credentials modal appears where you can enter
                Convex deploy keys (production, preview, dev) for the imported projects.
                Tinker Launch then generates <InlineCode>.envrc</InlineCode> and <InlineCode>cli.sh</InlineCode> for
                each project, just like it does for newly created ones.
              </p>
            </section>

            <Separator />

            {/* ── Activity Tracking ── */}
            <section id="activity-tracking" className="space-y-4 scroll-mt-20">
              <h2 className="text-2xl font-semibold tracking-tight">Activity Tracking</h2>
              <p className="text-[0.9375rem] text-muted-foreground">
                Tinker Launch includes a passive activity tracking system that attributes
                your time across projects by monitoring which windows are focused. It also
                parses Claude Code transcripts for token usage data.
              </p>

              <h3 className="text-lg font-medium">What data is collected</h3>
              <ul className="list-disc space-y-1 pl-6 text-[0.9375rem] text-muted-foreground">
                <li><strong>Window focus</strong> &mdash; Every 10 seconds, the daemon records which app and window is frontmost (app name, window title, bundle ID).</li>
                <li><strong>Claude Code transcripts</strong> &mdash; Token counts, message counts, and session duration are parsed from local <InlineCode>~/.claude/projects/</InlineCode> session files.</li>
              </ul>

              <h3 className="text-lg font-medium">Privacy</h3>
              <Callout variant="info">
                <ul className="list-disc pl-5 space-y-0.5">
                  <li><strong>Chrome Incognito windows are excluded</strong> &mdash; the daemon filters out any window with &quot;(Incognito)&quot; or &quot;(Private)&quot; in the title.</li>
                  <li>All data stays local in <InlineCode>~/.tinker-launch/activity/</InlineCode> and the SQLite database at <InlineCode>~/.tinker-launch/tinker.db</InlineCode>.</li>
                  <li>Shell command history is never tracked.</li>
                  <li>No data is sent to external services.</li>
                </ul>
              </Callout>

              <h3 className="text-lg font-medium">How it works</h3>
              <p className="text-[0.9375rem] text-muted-foreground">
                A macOS LaunchAgent (<InlineCode>com.tinker-launch.window-tracker</InlineCode>) runs
                automatically in the background, polling the frontmost window every 10 seconds and
                writing JSONL data to <InlineCode>~/.tinker-launch/activity/window-focus.jsonl</InlineCode>.
                The daemon auto-installs the first time you visit the Activity page.
              </p>
              <p className="text-[0.9375rem] text-muted-foreground">
                When the Activity page loads, ingestion and Claude Code transcript parsing run
                automatically &mdash; no manual steps needed. Data is matched to registered projects
                and aggregated into daily summaries in SQLite.
              </p>

              <h3 className="text-lg font-medium">How project matching works</h3>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-2.5 text-left font-medium">App Type</th>
                      <th className="px-4 py-2.5 text-left font-medium">Matching Strategy</th>
                      <th className="px-4 py-2.5 text-left font-medium">Activity Type</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b">
                      <td className="px-4 py-2.5">Terminal, iTerm2, Warp, Ghostty</td>
                      <td className="px-4 py-2.5">Parse directory from window title → match project <InlineCode>localPath</InlineCode></td>
                      <td className="px-4 py-2.5">Coding</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-4 py-2.5">VS Code, Cursor</td>
                      <td className="px-4 py-2.5">Match folder name in window title → project <InlineCode>repoName</InlineCode></td>
                      <td className="px-4 py-2.5">Coding</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-4 py-2.5">Browser on localhost</td>
                      <td className="px-4 py-2.5">Extract port number → match project port</td>
                      <td className="px-4 py-2.5">Browser (Local)</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-4 py-2.5">Browser on *.vercel.app</td>
                      <td className="px-4 py-2.5">Match repo name in URL</td>
                      <td className="px-4 py-2.5">Browser (Staging)</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5">Xcode</td>
                      <td className="px-4 py-2.5">Parse project name from window title</td>
                      <td className="px-4 py-2.5">Xcode</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </article>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
