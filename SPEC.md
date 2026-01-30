# Tinker Launch - Project Dashboard Spec

## Overview

Tinker Launch is a local project dashboard for rapid project scaffolding and management. It provides a single interface to spin up new projects with consistent defaults, track active development servers, and maintain organization across multiple concurrent projects.

## Problem Statement

When starting new projects daily, the setup process is repetitive and error-prone: creating GitHub repos, initializing local folders, configuring Claude defaults, setting up the tech stack, and managing which projects run on which ports. This dashboard automates the entire workflow from a simple input form.

## Core Workflow

### Input (Minimal User Entry)
- **Repo name** (kebab-case, e.g., `my-new-project`)
- **Project name** (display name, e.g., "My New Project")
- **GitHub org**: any configured org or username
- **One-paragraph description**

### Output (Automated)
1. Create GitHub repository under selected org
2. Create local folder at `~/Documents/GitHub/{repo-name}`
3. Initialize git with remote origin
4. Generate project defaults (see below)
5. Register project in dashboard with assigned port

---

## Project Defaults

### File: `CLAUDE.md`
```markdown
# {Project Name}

{One-paragraph description}

## Tech Stack
- Next.js (latest stable)
- Tailwind CSS 4 with shadcn/ui (sidebar-08 variant)
- Convex for database/backend
- Vercel for hosting
- Use Vercel CLI and Convex CLI for all deployments

## Development
- Run `npm run dev` for Next.js dev server
- Run `npx convex dev` for Convex in development mode
- Local dev server runs on port {assigned-port}

## Commands
- `vercel` - Deploy to Vercel
- `npx convex deploy` - Deploy Convex functions
```

### File: `TECH_STACK.md`
```markdown
# Tech Stack

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
1. `npm install`
2. `npx convex dev` (in separate terminal)
3. `npm run dev`
4. Open `http://localhost:{port}`
```

### MCP Configuration
Ensure Playwright MCP is installed and configured in `.claude/settings.json` or global Claude settings.

### `.gitignore` (standard Next.js + Convex)
```
node_modules/
.next/
.env.local
.env*.local
.convex/
```

---

## Port Management

### The Problem
With multiple projects running locally, it's easy to lose track of which project is on which port. Agents and humans alike get confused.

### Solution: Port Registry
Tinker Launch maintains a central port registry:

```json
// ~/.tinker-launch/ports.json
{
  "projects": {
    "my-project": { "port": 3001, "status": "running", "pid": 12345 },
    "another-app": { "port": 3002, "status": "stopped", "pid": null },
    "client-dashboard": { "port": 3003, "status": "running", "pid": 12346 }
  },
  "nextAvailable": 3004
}
```

### Port Assignment Rules
- Base port: `3001` (reserve 3000 for one-off testing)
- Auto-increment for each new project
- Dashboard shows live status (running/stopped)
- Optional: Inject port into project's `package.json` scripts

### Dashboard Features
- View all projects with their assigned ports
- See which servers are currently running (check PIDs)
- Quick-start/stop buttons
- Copy `localhost:{port}` to clipboard
- Filter by org (personal vs company)

---

## Dashboard UI

### Tech Stack (for Tinker Launch itself)
- Next.js (latest stable)
- Tailwind CSS 4 + shadcn/ui (sidebar-08)
- Convex for project registry persistence
- Runs locally on port `3000` (reserved)

### Views

#### Sidebar
- Projects list (grouped by org)
- Quick filter: All / per-org filters
- "+ New Project" button

#### Main Panel: Project List
| Project | Org | Port | Status | Actions |
|---------|-----|------|--------|---------|
| my-project | my-username | 3001 | Running | Open / Stop / GitHub |
| client-app | my-org | 3002 | Stopped | Start / GitHub |

#### New Project Modal
- Repo name input
- Project name input
- Org selector (dropdown from configured orgs)
- Description textarea
- "Create Project" button

#### Project Detail View
- Full description
- Links: GitHub, localhost, Vercel (if deployed)
- Recent activity / logs
- Port assignment
- Quick actions: Open in VS Code, Open terminal, etc.

---

## CLI Integration

Tinker Launch can also be invoked via CLI for scripting:

```bash
# Create new project
tinker-launch create my-project --org my-username --name "My Project" --desc "A cool thing"

# List projects
tinker-launch list

# Check ports
tinker-launch ports

# Start a project's dev server
tinker-launch start my-project

# Stop a project
tinker-launch stop my-project
```

---

## GitHub Integration

Uses `gh` CLI under the hood:

```bash
# Create repo
gh repo create {org}/{repo-name} --private --description "{description}"

# Clone to local (or init + add remote)
git init
git remote add origin https://github.com/{org}/{repo-name}.git
```

---

## Future Enhancements

1. **Template system**: Pre-configured starters beyond the default stack
2. **Vercel project linking**: Auto-run `vercel link` during setup
3. **Convex project creation**: Auto-run `npx convex init`
4. **Environment variables**: Template `.env.local` with common vars
5. **Project archiving**: Move old projects to archive, free up ports
6. **Agent context file**: Auto-generate context for AI agents about all active projects

---

## MVP Scope

### Phase 1: Core Dashboard
- [ ] Project creation flow (GitHub + local + defaults)
- [ ] Port registry
- [ ] Project list view
- [ ] Basic start/stop detection

### Phase 2: Polish
- [ ] CLI companion
- [ ] VS Code / terminal integrations
- [ ] Vercel + Convex auto-setup

### Phase 3: Intelligence
- [ ] Agent-friendly project context generation
- [ ] Auto-detect running servers
- [ ] Cross-project search
