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
