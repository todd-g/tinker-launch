# Linear API Key Storage in Credentials System

**Date:** 2026-03-18
**Type:** Build Log

## Context

Needed a way to call the Linear GraphQL API directly (instead of via MCP) to support multiple Linear workspaces. The existing MCP integration is limited to one workspace. Linear API keys are workspace-scoped, so the credential system needed a new `linear_keys` section keyed by workspace slug.

## What Changed

### Decision: GraphQL API over MCP
Decided to call the Linear GraphQL API directly (`https://api.linear.app/graphql`) rather than using the MCP server, which only supports one workspace at a time. Keys are stored in `credentials.yaml` alongside Vercel and Convex keys, keyed by Linear workspace slug (e.g. `parkbench`). This lets multiple projects in the same Linear workspace share one key, resolved via the existing `project.linearSlug` field.

### `src/lib/credentials.ts`
- Added `linear_keys: Record<string, string>` to `Credentials` interface
- Updated `DEFAULT_CREDENTIALS` and `readCredentials()` to include `linear_keys`
- Added `getLinearKey(credentials, slug)` — reads key by workspace slug
- Added `setLinearKey(slug, key)` — writes key to credentials.yaml
- Added `deleteLinearKey(slug)` — removes key from credentials.yaml
- Updated `getMaskedCredentials()` to mask linear keys in API responses

### `src/app/api/credentials/route.ts`
- Added `setLinearKey: { slug, key }` POST handler
- Added `deleteLinearKey: { slug }` POST handler

### `~/.tinker-launch/credentials.yaml`
- Added `linear_keys.parkbench` with the Parkbench workspace API key

## Files Modified

- `src/lib/credentials.ts` — New type, helpers, masking support
- `src/app/api/credentials/route.ts` — New POST handlers for set/delete
- `~/.tinker-launch/credentials.yaml` — Parkbench key written (local only, gitignored)

## Key Takeaways

- Linear keys are **workspace-scoped**, not project-scoped. Key is resolved via `project.linearSlug` → `linear_keys[slug]`
- Usage pattern: `const key = getLinearKey(creds, project.linearSlug)` then `Authorization: Bearer ${key}` on GraphQL requests
- The `linearSlug` field already existed on `DbProject` — no DB migration needed
- Nothing in the UI was built yet for managing linear keys — that would go in the credentials settings page
