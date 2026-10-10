# OpenRouter Key Management + Moving Projects Off Direct Gemini

**Date:** 2026-10-09
**Type:** Build Log

## Context

We're consolidating LLM spend onto a single OpenRouter account instead of calling Google's Gemini API directly from each project. One account means one bill. Per-project tracking therefore has to come from **one API key per project**, and per-client rebilling from **one workspace per paying entity**. Tinker Launch already owns per-project credentials and `.envrc` generation, so it now mints and tracks these keys as well.

## What Changed

### OpenRouter management in Tinker Launch (commit `3a05bc7`)

- **Settings → OpenRouter** (`src/app/settings/openrouter/page.tsx`) has these parts:
  - A management-key card (the key is validated against the API before it's saved).
  - Workspaces, with an org → workspace mapping.
  - A project-keys table showing limit, today / this month / total spend, and last used.
  - An unlinked-keys list.
  - A log of sync runs.
- **Minima-only gate:** a project can hold a key only if its org is mapped to a workspace. The server returns 400 otherwise, and the UI disables the button. Unmapped orgs default to "— Not in OpenRouter —".
- **`src/lib/openrouter.ts`** is a typed client for the management API covering workspaces and keys (create, list, update, delete). It also holds `syncOpenRouterUsage()`.
  - Listing keys calls every workspace, because the API only returns keys from the default workspace unless a workspace is named.
  - Each run is logged to `jobRuns` as `openrouter-sync`.
  - The page auto-syncs at most once when data is more than 10 minutes old.
- **`src/app/api/openrouter/route.ts`:** GET returns the dashboard state and never includes secrets. POST supports these actions: `setManagementKey`, `createWorkspace`, `mapOrgWorkspace`, `createProjectKey`, `updateProjectKey`, `linkExistingKey`, `unlinkProjectKey`, `revokeProjectKey`, `sync`.
  - The plaintext key is returned once, in the `createProjectKey` response.
- **`src/lib/db.ts`:** new `openrouterKeyUsage` table holding one snapshot per key per UTC day, with cumulative `usage`. Daily spend is the difference between consecutive days. Revoked keys keep their history for rebilling.
- **`src/lib/credentials.ts`:** `credentials.yaml` gains an `openrouter` section (`management_key`, `org_workspaces`, `project_keys` keyed by repo name).
  - `readCredentials()` normalizes the section so that writes from other settings actions don't drop it.
  - Masking hides both the management key and the project keys.
  - `generateEnvrcContent` emits `OPENROUTER_API_KEY`.
- The in-app docs have a new OpenRouter section. The Credentials table gets an OpenRouter badge column, and the sidebar a Settings → OpenRouter link.

### `.envrc` regeneration no longer wipes hand-added lines

`regenerateEnvrcForProject` and `/api/generate-project-env` used to overwrite `.envrc` completely. Any secret added by hand (Sentry, PostHog, QA passwords and so on) was deleted the next time credentials synced. `writeEnvrc` / `mergeEnvrcContent` now replace only the header and the Tinker-managed vars (`MANAGED_ENVRC_VARS`) and keep every other line below them. The merge is idempotent. Removing a managed key, for example by unlinking an OpenRouter key, removes its line.

### Three Minima projects switched from direct Gemini to OpenRouter

These changes live in their own repos; listed here for the record:

1. **Convex-actions project:** the raw `generateContent` wrapper became a chat-completions call.
   - Gemini's uppercase schemas became standard JSON Schema, sent as `response_format: json_schema` with strict off.
   - `reasoning: { effort: "none" }` replaces `thinkingBudget: 0`.
   - Deployed to staging, verified live, then to prod.
2. **Local Next.js orchestrator:** the decision model's Google SDK path became a fetch to OpenRouter.
   - Settings saved under the old `provider: "google"` value still route through OpenRouter, with 2.0 and 2.5 model IDs mapped to current models.
   - Pricing lookups strip the `google/` prefix.
3. **Vercel agent (AI SDK):** `@ai-sdk/google` was replaced by `@openrouter/ai-sdk-provider`.
   - `modelContextWindowTokens` must be set explicitly, because the agent framework can't look up an OpenRouter model's context window.
   - A live two-step tool loop confirmed that Gemini reasoning details survive the round trip.

A read-only audit of the other Minima repos found two more still calling Gemini directly, both on 2.5 models. They still need switching.

## Files Modified

- `src/lib/openrouter.ts` — new: management API client, snapshotting, sync job
- `src/app/api/openrouter/route.ts` — new: admin API (GET state, POST actions)
- `src/app/settings/openrouter/page.tsx` — new: Settings → OpenRouter page
- `src/lib/credentials.ts` — `openrouter` section, helpers, masking, `writeEnvrc`/`mergeEnvrcContent`, `OPENROUTER_API_KEY` in `.envrc`
- `src/lib/db.ts` — `openrouterKeyUsage` table and its helpers (latest per hash, history, daily spend, totals)
- `src/app/api/generate-project-env/route.ts` — includes the OpenRouter key and writes through `writeEnvrc`
- `src/app/settings/page.tsx` — OpenRouter link card and `.envrc` template line
- `src/app/settings/credentials/page.tsx` — OpenRouter badge column
- `src/components/app-sidebar.tsx` — Settings → OpenRouter entry
- `src/app/docs/page.tsx` — OpenRouter docs section

## Key Takeaways

- **Gemini 2.5 Flash, Flash Lite and Pro expire on OpenRouter on 2026-10-20.**
  - The default replacement is `google/gemini-3.1-flash-lite`: reasoning is optional, so `effort: "none"` works (verified live), and it's cheaper than 2.5 Flash.
  - Gemini 3.5 and later Flash models have mandatory reasoning and reject `"none"`.
- **Workspace = paying entity; key = project.** Billing is pooled (one invoice). Rebilling a client means filtering by workspace and using the snapshot history. Keys can be moved between workspaces later without being rotated.
- **direnv gotcha:** after Tinker regenerates `.envrc`, direnv blocks the file until `direnv allow`, and only re-exports at the *next prompt*.
  - `direnv allow && npx convex env set X "$X"` on one line pushes an **empty** value, and the CLI still reports success.
  - Use `bash -c 'source .envrc && …'`. The key dialog and the docs now show that form.
- **Sourcing `.envrc` exports the prod `CONVEX_DEPLOY_KEY`**, so `npx convex …` then targets production. For dev, run `env -u CONVEX_DEPLOY_KEY npx convex …`, which falls back to `.env.local`'s `CONVEX_DEPLOYMENT`.
- **Plain `vercel` without the `.envrc` token** fails with "Could not retrieve Project Settings". Use `./cli.sh vercel …`, which passes `--token`.
- **Push the key only to the runtime that calls the model** (Convex actions, Vercel functions, or a local server's env). A key in the wrong place does nothing and hides the real gap.
- **CLI-only Vercel projects deploy the working tree,** including uncommitted work. Before deploying from a clean checkout, compare file modification times with the last production deploy so you don't roll back features that are live but uncommitted.
