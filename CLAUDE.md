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

## Key Commands
- `vercel` - Deploy to Vercel
- `npx convex deploy` - Deploy Convex functions
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
