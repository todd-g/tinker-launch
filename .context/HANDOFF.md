# Tinker Launch - Handoff Document

**Date**: January 11, 2025
**Status**: MVP functional, running on localhost:3000

## What This Project Is

Tinker Launch is a local project dashboard for rapid scaffolding and management of new projects. It solves the problem of:
1. Repetitive project setup (GitHub repo, local folder, git init, defaults)
2. Losing track of which project runs on which localhost port
3. Inconsistent project configurations

## Current State

### Running Services
- **Next.js**: http://localhost:3000 (dev server running in background)
- **Convex**: Connected to `trustworthy-cricket-962` deployment

### What's Built

#### Core Features
1. **Project List** (`/`) - View all registered projects, filter by org (todd-g/minimagroup)
2. **New Project** (`/new`) - Form to create projects with:
   - GitHub repo creation (via `gh` CLI)
   - Local folder scaffolding
   - Git init with remote
   - Auto-generated CLAUDE.md and TECH_STACK.md
   - Auto-assigned port (starting from 3001)

3. **Port Scanner** (`/ports`) - Real-time system port scanning:
   - Scans ports 3000-3100
   - Shows process name, PID, working directory
   - Identifies registered vs unregistered projects
   - Updates project status based on actual port usage

4. **Settings** (`/settings`) - Edit default templates:
   - TECH_STACK.md template
   - CLAUDE.md template
   - Templates support variables: `{projectName}`, `{description}`, `{port}`

5. **Dark/Light Mode** - Toggle in sidebar footer

### Tech Stack
- Next.js 16 (App Router, Turbopack)
- Tailwind CSS 4
- shadcn/ui (sidebar-08 layout)
- Convex (database)
- next-themes (dark mode)
- Nature theme from tweakcn

### Project Structure
```
src/
├── app/
│   ├── page.tsx              # Project list
│   ├── new/page.tsx          # New project form
│   ├── ports/page.tsx        # Port scanner
│   ├── settings/page.tsx     # Template editor
│   └── api/
│       ├── create-project/   # Project creation API
│       └── scan-ports/       # System port scanner
├── components/
│   ├── app-sidebar.tsx       # Main navigation
│   ├── project-list.tsx      # Project table
│   ├── theme-toggle.tsx      # Dark/light switch
│   ├── theme-provider.tsx    # next-themes wrapper
│   └── convex-provider.tsx   # Convex client
├── lib/
│   ├── github.ts             # gh CLI wrapper
│   ├── scaffolding.ts        # File generation
│   └── port-registry.ts      # Port utilities
└── types/
    └── project.ts            # TypeScript types

convex/
├── schema.ts                 # Database schema
├── projects.ts               # Project CRUD
└── settings.ts               # Settings storage
```

### Database Schema (Convex)
- **projects**: repoName, projectName, org, description, localPath, githubUrl, port, status, pid, createdAt
- **settings**: key-value store for templates

## Known Issues / TODOs

1. **Port scanner cwd detection** - Sometimes can't get working directory for processes
2. **No project deletion UI** - Need to add delete button
3. **Templates not used in scaffolding yet** - Settings page saves templates but scaffolding.ts uses hardcoded defaults
4. **No Vercel/Convex auto-setup** - Could auto-run `vercel link` and `npx convex init` for new projects

## Commands

```bash
# Start dev server (already running)
npm run dev

# Convex dev (already running in background)
npx convex dev

# Lint
npm run lint
```

## Environment

- `.env.local` configured with Convex URL
- GitHub CLI (`gh`) must be authenticated
- Projects created in `~/Documents/GitHub/`

## Files to Reference

- `SPEC.md` - Full product specification
- `CLAUDE.md` - Project context for Claude
- `TECH_STACK.md` - Stack documentation
- `README.md` - Setup instructions
