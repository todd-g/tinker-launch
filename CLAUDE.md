# Tinker Launch

A local project dashboard for rapid scaffolding and management of new projects. Automates GitHub repo creation, local folder setup, Claude/MCP defaults, and tech stack boilerplate. Includes a port registry to track which project runs on which localhost port.

## Tech Stack
- Next.js (latest stable, App Router)
- Tailwind CSS 4 with shadcn/ui (sidebar-08 variant)
- Convex for database/backend
- Vercel for hosting
- Use Vercel CLI and Convex CLI for all deployments

## Development
- Run `npm run dev` for Next.js dev server (port 3001 - reserved for this dashboard)
- Run `npx convex dev` for Convex in development mode

## Deployments & Credentials

This project uses credential files managed by Tinker Launch. The `.envrc` file contains environment variables for Vercel and Convex authentication.

**Using cli.sh (recommended for agents):**
```bash
./cli.sh vercel              # Deploy to Vercel
./cli.sh npx convex deploy   # Deploy Convex functions
./cli.sh vercel whoami       # Check which Vercel account is active
```

**If direnv is installed:**
The credentials auto-load when you `cd` into this directory. You can then run commands directly:
```bash
vercel
npx convex deploy
```

**Important:** Never commit `.envrc` - it contains sensitive tokens and is gitignored.

## Other Commands
- `gh` - GitHub CLI for repo creation

## Project Structure (Planned)
```
/app              - Next.js App Router pages
/components       - React components (shadcn/ui)
/convex           - Convex schema and functions
/lib              - Utilities (port registry, GitHub integration)
/templates        - Default files for new projects
```

## Core Features
1. Create new projects with minimal input (repo name, project name, org, description)
2. Auto-generate GitHub repo, local folder, git init
3. Port registry to track localhost assignments
4. Dashboard view of all projects with status

## Build Philosophy: Maximum Observability & Control

Every feature we build gets a companion **Admin section** with full observability. For some utilities, the Admin *is* the entire UI. This means:

- **Full CRUD** for every data model we touch — no entity should exist without a way to view, create, edit, and delete it from Admin.
- **Job logs** for any background process, parser, sync, or scheduled task. Every run should be logged with timestamp, status, duration, and details. Logs should be viewable in Admin.
- **Action buttons** to manually kick off any job or process from Admin. If something can run automatically, it should also have a button to trigger it on demand. Example: a parser should have a "Run Parser" button in Admin, plus a log of all parse runs with their results.
- Think of Admin as the control panel for the entire system — if it exists, it should be visible and controllable from Admin.

## Documentation Section (In-App)

Every project must include a **Documentation section** within Admin, styled similar to Docusaurus (sidebar navigation, markdown rendering, category grouping). This serves as the living documentation for the project.

### Dev Progress Logs
Always maintain a **dev Progress log** within the Documentation section. Use the `/progress` skill to generate progress entries after each work session. Progress logs follow this format:

- **Location**: `docs/progress/`
- **File naming**: `YYYY-MM-DD_HHMM--[descriptive-slug].md`
- **Structure**: Each entry includes Context, What Changed (with subsections), Files Modified, and Key Takeaways
- **Frequency**: One log per focused work session

This ensures we always have a clear trail of what was built, why, and what changed.

## Git Author by Org

When committing, use the correct email based on the GitHub org:
- **Personal** (toddgalloway): `toddgalloway@gmail.com`
- **minimagroup**: `todd@minima.nyc`

Set the author on commits accordingly (e.g., `git commit --author="Todd Galloway <todd@minima.nyc>"`).

## shadcn/ui Guidelines

- **Never roll your own sidebar.** Always use the `sidebar-08` block from shadcn/ui as the base. Customize it as needed, but start from the block — do not build sidebar navigation from scratch.
- When using shadcn/ui blocks, check the [blocks library](https://ui.shadcn.com/blocks) first before building custom layouts.
