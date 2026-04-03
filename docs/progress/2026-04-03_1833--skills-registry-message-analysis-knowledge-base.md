# Skills Registry, Message Analysis, and Knowledge Base

**Date:** 2026-04-03
**Type:** Build Log

## Context

Brainstorming session on how Tinker Launch can do more for development workflow and project management. Identified three new features: (1) a Skills Registry to manage Claude Code skills/commands across all projects, (2) a Message Analysis dashboard that parses Claude Code conversation history to find patterns, and (3) a Knowledge Base for capturing decisions, patterns, and learnings. Also researched the Claude Code skills vs commands ecosystem — skills are an open standard (agentskills.io) supported by 11+ tools (Claude Code, Codex, Cursor, Windsurf, Gemini CLI, etc.), while commands are Claude Code-specific and on the deprecation track.

## What Changed

### Skills Registry (`/skills`)

Built a filesystem-first skills scanner that discovers skills and commands across `~/.claude/skills/`, `~/.claude/commands/`, and every tracked Tinker project's `.claude/` directory. No SQLite table — the filesystem is the source of truth, scanned on demand.

- **Core library** (`src/lib/skills.ts`): YAML frontmatter parsing, recursive directory scanning (supports nested `skills/foo/SKILL.md` and flat `commands/foo.md`), write/delete helpers, deterministic IDs via MD5 hash of file path
- **API route** (`src/app/api/skills/route.ts`): GET with filtering (scope, type, projectId), POST with actions (create, update, delete, migrate, migrateBulk)
- **Registry page** (`src/app/skills/page.tsx`): Table with search, scope/type filter toggles, view/edit/delete dialogs with full frontmatter editing
- **Skill creator** (`src/app/skills/new/page.tsx`): Form with scope/type/project selection, name validation (kebab-case), all frontmatter fields (basic + collapsible advanced), live file preview panel showing the generated SKILL.md

### Command-to-Skill Migration

Added migration tooling since commands are Claude Code-specific while skills are an open standard. The migration:
- Moves `commands/foo.md` to `skills/foo/SKILL.md` (same content, portable format)
- Auto-detects action commands (deploy, push, commit, etc.) and adds `disable-model-invocation: true`
- Warns on missing description and content over 500 lines
- Supports both single migration (with dialog to add description) and bulk migration
- Deletes original command file after successful migration

Found 42 commands + 1 skill across 6 projects + 4 personal.

### Message Analysis (`/messages`)

Parses Claude Code JSONL conversation files from `~/.claude/projects/`. Key challenge: the `sessions-index.json` session IDs don't match JSONL filenames (zero overlap in testing), so the scanner indexes JSONL files directly by scanning directories.

- **Core library** (`src/lib/messages.ts`): Session discovery (both indexed and non-indexed directories), JSONL parsing extracting user messages/assistant responses/tool calls/token usage, prompt pattern detection via intent extraction and normalization, slash command usage tracking
- **API route** (`src/app/api/messages/route.ts`): GET with `action=analyze` (full analysis) or `action=sessions` (session list)
- **Dashboard page** (`src/app/messages/page.tsx`): Five tabs — Overview (stats cards + project breakdown), Prompt Patterns (repeated prompts flagged as skill candidates), Slash Commands (usage ranking), Tool Usage (invocation counts), Recent Sessions

Results from first scan: 783 sessions, 1.5K user messages, 2.7M output tokens across 35 projects. Detected 24 prompt patterns and 11 slash commands (top: `/tgcc` at 353x, `/progress` at 21x).

### Knowledge Base (`/knowledge-base`)

SQLite-backed with three entry types matching the brainstorming framework:
- **Decisions**: "We chose X over Y because Z" — architecture choices, library picks
- **Patterns**: "This is how we do X" — repeatable validated approaches
- **Learnings**: "We tried X and discovered Y" — insights from experimentation

- **DB schema**: `knowledgeBase` table in `src/lib/db.ts` with id, type, title, content, tags (comma-separated), projectId (optional), timestamps
- **API route** (`src/app/api/db/knowledge-base/route.ts`): Standard GET with filters + POST CRUD
- **UI page** (`src/app/knowledge-base/page.tsx`): Card-based layout with type-colored icons (GitBranch/BookOpen/Lightbulb), type filter buttons with counts, search, create/edit dialog with project association and tags, hover actions

### Sidebar Navigation

Added three new sections to `src/components/app-sidebar.tsx`:
- Skills (Sparkles icon) — Registry, New Skill
- Messages (MessageSquare icon) — Analysis
- Knowledge Base (Brain icon) — Browse

Placed between Activity and Documentation in the nav order.

## Files Modified

- `src/lib/skills.ts` — New: skill scanning, parsing, CRUD, migration logic
- `src/lib/messages.ts` — New: JSONL conversation parsing, pattern detection, analysis
- `src/lib/db.ts` — Added knowledgeBase table schema and CRUD operations
- `src/app/api/skills/route.ts` — New: skills API (scan, create, update, delete, migrate, migrateBulk)
- `src/app/api/messages/route.ts` — New: message analysis API
- `src/app/api/db/knowledge-base/route.ts` — New: KB CRUD API
- `src/app/skills/page.tsx` — New: skills registry with migration UI
- `src/app/skills/new/page.tsx` — New: skill creator with live preview
- `src/app/messages/page.tsx` — New: message analysis dashboard (5 tabs)
- `src/app/knowledge-base/page.tsx` — New: KB browse/create/edit page
- `src/components/app-sidebar.tsx` — Added Skills, Messages, Knowledge Base nav sections

## Key Takeaways

- Skills are an open standard (agentskills.io) adopted by 11+ tools. Commands are Claude Code-only and heading for deprecation. All new work should use `.claude/skills/foo/SKILL.md` format
- Skills are a strict superset of commands — everything commands do, skills do better (supporting files, invocation control, subagent execution, dynamic context injection, tool restrictions)
- `sessions-index.json` in `~/.claude/projects/` is unreliable for finding JSONL files — session IDs in the index don't match filenames. Must scan directories directly for `.jsonl` files
- Filesystem-first approach (no DB table) for skills works well — scan is fast with <100 files, avoids sync issues, and the filesystem is already the source of truth for Claude Code
- The three features form a flywheel: Message Analysis discovers patterns -> Knowledge Base captures them -> mature patterns graduate into Skills -> skill usage feeds back into Message Analysis
- `disable-model-invocation: true` is critical for any skill with side effects (deploy, push, commit) — prevents Claude from auto-triggering dangerous operations
- SKILL.md best practices: keep under 500 lines, use supporting files for reference material, front-load description (truncated at 250 chars), use kebab-case naming
