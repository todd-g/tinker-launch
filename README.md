# Tinker Launch

A local project dashboard for rapid scaffolding and management of new projects. Automates GitHub repo creation, local folder setup, Claude/MCP defaults, and tech stack boilerplate.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Convex

```bash
npx convex dev
```

This will:
- Prompt you to log in to Convex (if needed)
- Create a new Convex project
- Generate the proper types in `convex/_generated/`
- Populate `.env.local` with your Convex URL

### 3. Authenticate GitHub CLI

Make sure you're logged in to GitHub CLI:

```bash
gh auth status
```

If not authenticated:

```bash
gh auth login
```

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001)

### 5. Configure your organizations

Go to **Settings → Credentials** and add your GitHub orgs/usernames mapped to credential accounts. This enables the sidebar org filter and credential generation for new projects.

You can optionally set the `PROJECTS_DIR` environment variable to customize where new projects are created (defaults to `~/Documents/GitHub`).

## Features

- **Project Creation**: Create new GitHub repos with one click
- **Auto-scaffolding**: Generates CLAUDE.md, TECH_STACK.md, and .gitignore
- **Port Registry**: Track which project runs on which localhost port
- **Organization Support**: Configure your GitHub orgs/usernames in Settings → Credentials

## Tech Stack

- Next.js 16 (App Router)
- Tailwind CSS 4
- shadcn/ui (sidebar-08)
- Convex (database)
- GitHub CLI (repo creation)

## Project Structure

```
├── src/
│   ├── app/               # Next.js pages
│   │   ├── page.tsx       # Project list (home)
│   │   ├── new/           # New project form
│   │   ├── ports/         # Port registry view
│   │   └── api/           # API routes
│   ├── components/        # React components
│   ├── lib/               # Utilities
│   │   ├── github.ts      # GitHub CLI wrapper
│   │   ├── scaffolding.ts # Project file generation
│   │   └── port-registry.ts # Port checking utilities
│   └── types/             # TypeScript types
├── convex/                # Convex schema and functions
└── SPEC.md                # Full project specification
```

## Development

```bash
# Run Next.js dev server
npm run dev

# Run Convex dev server (in separate terminal)
npx convex dev

# Type checking
npm run lint
```
