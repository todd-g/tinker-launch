# Tinker Launch

A local project dashboard for rapid scaffolding and management of new projects. Automates GitHub repo creation, local folder setup, Claude/MCP defaults, and tech stack boilerplate. Includes a port registry to track which project runs on which localhost port.

## Tech Stack
- Next.js (latest stable, App Router)
- Tailwind CSS 4 with shadcn/ui (sidebar-08 variant)
- SQLite via better-sqlite3 (local database at `~/.tinker-launch/tinker.db`)
- Vercel for hosting
- Use Vercel CLI for deployments

## Development
- Run `npm run dev` for Next.js dev server (port 3001 - reserved for this dashboard)
- SQLite database auto-creates on first run — no setup needed

## Working Agreement

**Autonomy.** Once we've agreed on a plan or task list, execute it to completion without checking in. Don't stop to ask "should I continue?" between items. Only stop for: (1) destructive or production-facing actions — deploys, deletes, migrations, anything touching prod data; (2) a genuine fork where my answer changes what you'd build; (3) being truly blocked. New ideas I mention mid-run go onto the task list, not into an immediate detour.

**Transient errors.** On rate limits, overloads, or 5xx errors from any API or tool, wait and retry up to 3 times before stopping. Never end a work session over a transient infrastructure error without retrying.

**Approach visibility.** When starting a feature or refactor, state your approach in ≤3 lines as you begin — what you'll reuse vs. create, and what existing behavior must not change — then proceed immediately. This is not a request for approval; do not wait for a reply. It exists so I can interrupt early if the approach is wrong. Prefer extending existing components over duplicating them.

**UI self-verification.** After visual changes, check your own rendered output (screenshot or inspect: one content width, one type scale, semantic colors correct, new controls actually visible on the target page) and fix what you find before showing me. Don't present UI work, or ask me to look, until your own check passes.

## Multi-Model Routing (Claude Code + Codex)

You can shell out to the **Codex CLI (GPT-6)** via bash for *model diversity* — independent review and adversarial checks — not as a second labor pool. Orchestrate from this session; Claude subagents (Opus/Sonnet) are the default workers. (This mirrors the global routing config; kept here so it travels with the repo.)

**Pool status (Sept 2026):** I use Codex interactively for dev, so the Plus quota is the *contested* pool. Claude is the working pool. Do not spend Codex quota on work a Claude subagent can do.

**Axes** — *Intelligence* = hardest problem handled unsupervised; *Taste* = UI/UX, code quality, API design, copy, fit with existing patterns; *Cost* = spend against my subs, not API list price.

| Model | Reach | Cost | Intelligence | Taste | Use for |
|---|---|---|---|---|---|
| **GPT-6** (`gpt-6-astra`) | `codex` CLI | Plus quota, shared with my own Codex sessions (~15–80 msgs/5h) | high | low | independent review, adversarial checks, escape hatch when Claude is rate-limited |
| **Fable 5.1 / Opus 5.5** | this session + subagents | — | high | high | orchestration, UI/API, taste-critical code, final judgment; Opus is the default implementation subagent |
| **Sonnet 5.5** | subagents | cheap tier | mid-high (provisional) | mid-high (provisional) | narrow, fully-briefed subtasks: bulk reading, log/PDF digging, test/build runs, single-concern edits under Opus review |

Sonnet 5.5 ratings are provisional (2026-09-29, community reports, not yet measured here). **Haiku is dropped** — Sonnet 5.5 is the cheap tier.

### Default lanes (Claude subagents first; Codex for review only)

Claude is the working pool. Route by lane:

| Lane | Route | Notes |
|---|---|---|
| Settled-spec implementation | **Opus subagent** (Fable if taste-critical) | Claude reviews the diff before it counts |
| Narrow, fully-briefed subtask (one concern, clear acceptance check) | **Sonnet 5.5 subagent** | escalate to Opus on the first miss, don't retry Sonnet |
| Bulk reading, tracing, log/PDF digging | **Sonnet subagent** (Explore / general-purpose) | escalate to Opus if the first pass is weak |
| Tests, builds, repro, noisy output | **Sonnet subagent** | reports the verdict, not the wall of output |
| Second-opinion / adversarial review | `codex-review` | broad change, or user asks — **the one lane where Codex earns its quota** |
| Codex investigate / implement / verify | `codex-*` skills | **only** on an explicit ask, or as an escape hatch when Claude subagents are rate-limited; say so in the footer |

There is also a **`codex-worker` subagent** (Sonnet, Bash-only) that runs one Codex call and relays the result — use it for a review/adversarial stage inside Workflow scripts where GPT can't be a stage model, not as a general fan-out pool.

**Stay in Claude for:** UI, copy, API/SDK shape, naming, architecture, final judgment, and reviewing everything Codex produced. GPT-6 writes TS like a Python dev and won't follow this repo's Admin/observability conventions unless the prompt points it at this file. **Keep reasoning effort on `high`** in Claude (xhigh/max overthink per-step and blow up cost); Codex runs on `gpt-6-astra` at high effort by default (`~/.codex/config.toml`); pass `-c model_reasoning_effort="medium"` for routine calls or `"low"` for mechanical ones.

**The binary:** `codex` on PATH at `/opt/homebrew/bin/codex` (`brew install --cask codex`, self-updating), authed on ChatGPT Plus — check with `codex login status`.

```bash
codex exec -s read-only "<prompt>" -o out.txt < /dev/null           # investigate; -o = clean final answer only
codex exec -s workspace-write -C <worktree> "<spec>" -o out.txt < /dev/null   # implement, isolated
codex exec "<prompt>" -i shot.png -s read-only < /dev/null          # vision; prompt BEFORE -i (variadic)
codex review --uncommitted < /dev/null                              # review; NO positional prompt with --uncommitted
```

**Gotchas (load-bearing):** always `< /dev/null` or a backgrounded run hangs on stdin forever. Always `-o <file>` on `exec` — it writes only the final message, so you never parse the noisy transcript (`codex review` has no `-o`; take the last `codex` block before `tokens used`). Point Codex at this CLAUDE.md when it writes code. Isolate write runs in a `git worktree` — but check `git status` first, because a fresh worktree has only committed work, and this repo currently has a lot untracked; Codex will recreate a missing file by copying it, handing you a duplicate rather than an edit. Verify its claims against the code — for implement runs read the `git diff`, not its summary. Describe the *outcome* you want, not just a pattern to copy: Codex is literal enough to follow a stated pattern into a wrong answer. If Codex finds nothing, that's a valid answer; don't loop.

**Show your model mix.** After any substantial multi-step task, end with a one-line footer of what was routed where — **including when everything stayed in Claude** (no delegation). Qualitative only, never invent token/cost numbers. E.g. `Models: Opus (everything — no delegation)`, `Models: Fable (orchestration) · Opus (impl subagent) · Sonnet×2 (log digging, parallel)`, or `Models: Opus (impl) · Codex/6 (independent review)`. Skip it on trivial edits and conversational turns.

## Deployments & Credentials

This project uses credential files managed by Tinker Launch. The `.envrc` file contains environment variables for Vercel authentication. Credentials are stored in `~/.tinker-launch/credentials.yaml`.

**Using cli.sh (recommended for agents):**
```bash
./cli.sh vercel              # Deploy to Vercel
./cli.sh vercel whoami       # Check which Vercel account is active
```

**If direnv is installed:**
The credentials auto-load when you `cd` into this directory. You can then run commands directly:
```bash
vercel
```

**Important:** Never commit `.envrc` - it contains sensitive tokens and is gitignored.

## Other Commands
- `gh` - GitHub CLI for repo creation

## Linear Integration

**Use the GraphQL API directly — do NOT use the Linear MCP.**

The Linear MCP is limited to one workspace. This project supports multiple workspaces via `LINEAR_API_KEY` in `.envrc` (set per-project in Settings → Credentials).

```bash
# GraphQL endpoint
https://api.linear.app/graphql

# Auth header
Authorization: Bearer $LINEAR_API_KEY
```

Example query:
```ts
const res = await fetch("https://api.linear.app/graphql", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.LINEAR_API_KEY}`,
  },
  body: JSON.stringify({ query: `{ viewer { id name } }` }),
});
```

API keys are stored in `~/.tinker-launch/credentials.yaml` under `linear_keys`, keyed by workspace slug. Use `getLinearKey(credentials, project.linearSlug)` from `src/lib/credentials.ts` to resolve the key for a given project.

## Project Structure
```
/app              - Next.js App Router pages
/components       - React components (shadcn/ui)
/lib              - Utilities (port registry, GitHub integration, SQLite DB, activity tracking)
/scripts          - Window tracking daemon and LaunchAgent plist
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
- **Super-Green**: `todd@super.green`

Set the author on commits accordingly (e.g., `git commit --author="Todd Galloway <todd@minima.nyc>"`).

## shadcn/ui Guidelines

- **Never roll your own sidebar.** Always use the `sidebar-08` block from shadcn/ui as the base. Customize it as needed, but start from the block — do not build sidebar navigation from scratch.
- When using shadcn/ui blocks, check the [blocks library](https://ui.shadcn.com/blocks) first before building custom layouts.
