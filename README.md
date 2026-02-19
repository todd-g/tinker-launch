# Tinker Launch

A local dashboard for spinning up and managing projects. Create a GitHub repo, scaffold files, assign a port, and track everything from one place.

Built for developers who start new projects constantly and want a single pane of glass for all of them.

## Set Up with Claude Code

Copy this prompt, paste it into [Claude Code](https://docs.anthropic.com/en/docs/claude-code), and it will handle the entire setup:

```
Clone and set up Tinker Launch. Run these steps, pausing for my input when noted:

1. git clone https://github.com/todd-g/tinker-launch.git && cd tinker-launch
2. npm install
3. Run `npx convex dev` — this will prompt me to log in to Convex and create a project. Wait for me to complete the login flow before continuing.
4. Verify `gh auth status` — if not authenticated, run `gh auth login` and wait for me to complete it.
5. Run `npm run dev` to start the dev server on port 3001.
6. Tell me to open http://localhost:3001 and go to Settings → Credentials to configure my GitHub orgs.
```

That's it. The rest of this README covers what's happening under the hood.

---

## Manual Setup

### Prerequisites

| Tool | What it's for | Install |
|------|--------------|---------|
| **Node.js** 18+ | Runtime | [nodejs.org](https://nodejs.org) |
| **GitHub CLI** (`gh`) | Repo creation from the dashboard | `brew install gh` |
| **Convex** | Database (free tier works) | Signs up during setup |

### 1. Clone and install

```bash
git clone https://github.com/todd-g/tinker-launch.git
cd tinker-launch
npm install
```

### 2. Set up Convex

```bash
npx convex dev
```

This will:
- Prompt you to log in (or create a free Convex account)
- Create a new Convex project
- Write your Convex URL to `.env.local`

Leave this running in its own terminal — it live-syncs your schema and functions during development.

### 3. Authenticate GitHub CLI

```bash
gh auth status    # Check if already logged in
gh auth login     # If not, follow the prompts
```

### 4. Start the dev server

In a second terminal:

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001)

### 5. Configure your orgs

Go to **Settings → Credentials** and add your GitHub orgs/usernames. This powers the org filter in the sidebar and credentials for new projects.

New projects are created in `~/Documents/GitHub/` by default. Set the `PROJECTS_DIR` environment variable to change this.

---

## What It Does

**Create projects** — Enter a repo name, pick an org, and Tinker Launch creates the GitHub repo, clones it locally, scaffolds `CLAUDE.md` / `TECH_STACK.md` / `.gitignore`, and assigns the next available port.

**Port registry** — Every project gets a unique localhost port. The Ports page shows what's running, what's stopped, and lets you copy `localhost:{port}` to your clipboard. No more port conflicts.

**Credential management** — Store Vercel tokens and Convex deploy keys per-project. Tinker Launch generates `.envrc` files so each project has its own isolated credentials. Keys are auto-synced when you update them.

**Project scanner** — Detects projects already running on your machine and pulls them into the dashboard, even if they weren't created by Tinker Launch.

---

## What Gets Scaffolded

When you create a new project, these files are generated automatically:

| File | Purpose |
|------|---------|
| `CLAUDE.md` | AI agent instructions — tech stack, commands, port number |
| `TECH_STACK.md` | Human-readable tech stack reference |
| `.gitignore` | Standard Next.js + Convex ignores |
| `.tinker.yaml` | Project metadata for the port scanner |

The default stack is **Next.js + Tailwind CSS 4 + shadcn/ui + Convex + Vercel**, but you can edit the scaffolded files after creation.

---

## Tech Stack

- **Next.js 16** (App Router)
- **Tailwind CSS 4** + **shadcn/ui** (sidebar-08 layout)
- **Convex** (database, real-time subscriptions)
- **GitHub CLI** (repo creation)

## Project Structure

```
src/
├── app/                    # Next.js pages & API routes
│   ├── page.tsx            # Project list (home)
│   ├── new/                # New project form
│   ├── ports/              # Port registry
│   ├── settings/           # Credentials & import
│   ├── docs/               # In-app documentation
│   └── api/                # Backend API routes
├── components/             # React components (shadcn/ui)
└── lib/                    # Utilities
    ├── credentials.ts      # Credential read/write/generation
    ├── github.ts           # GitHub CLI wrapper
    └── port-registry.ts    # Port scanning & assignment
convex/
├── schema.ts               # Database schema
├── projects.ts             # Project queries & mutations
└── settings.ts             # App settings
```

## Development

```bash
# Terminal 1 — Convex (live schema sync)
npx convex dev

# Terminal 2 — Next.js dev server
npm run dev

# Lint
npm run lint
```

## License

[MIT](LICENSE)
