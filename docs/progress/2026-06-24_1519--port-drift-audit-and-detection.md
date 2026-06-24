# Port-Drift Audit, Activity Repair & Dashboard Detection

**Date:** 2026-06-24
**Type:** Build Log

## Context

Several projects' registered ports in the SQLite registry (`~/.tinker-launch/tinker.db`, `projects.port`) had drifted from the actual dev-server port. Because activity matching keys `localhost:PORT` off the registry port (`matchWindowToProject` in `src/lib/activity.ts`), this misattributed or dropped localhost time. A prior manual fix (sokospec 8021→8022) prompted a full audit of all non-archived projects, repair of historical misattribution, and a root-cause dashboard feature to catch drift going forward.

## What Changed

### 1. Registry port drift fixed (collision-safe)
- **laudeslearning** 3005 → **3008** (`next dev --turbopack -p 3008`)
- **opsworx** 3005 → **3006** (`next dev -p 3006`)

Both were colliding on 3005. After the fix, opsworx's 15 stranded `localhost:3006` snapshots **auto-rematched** (they were unmatched/`NULL projectId`, so the app's normal `rematchUnmatched` picked them up — +2.5 min in `activityDaily`). laudeslearning had no historical localhost traffic to repair.

Audit finding: `package.json -p` is NOT a universal source of truth. schoolboard uses `next dev -p ${PORT:-8016}` (correct, registry 8016 confirmed by 1468 matched snapshots); sidequest3 (`-p 3001`, iOS) and knowitall (`-p 3028`) had stale scaffold values that would have *created* collisions — their registries were already correct.

### 2. Pollinator misattribution repaired
The "Pollinator" cluster was two distinct apps (disambiguated by window title + date):
- **pollinator-front** (report.pollinator.coop UI): registered new on port **4000**; 113 snapshots reassigned (95 on 4000 + 18 on 3023).
- **pollinator-api** (Django admin, "Select … to change | Pollinator"): 54 snapshots on 8009 reassigned to the existing entry.

This removed inflation from **tickslayer3000** (−9.0 min) and **minimabridge** (−3.0 min). `activityDaily` was rebuilt from `source='window_tracker'` snapshots for all 4 projects. Snapshot `org`/`chromeProfile` columns were preserved (they reflect the Chrome profile, not the project).

### 3. Config reconciliation
- **package.json `-p`**: sidequest3 `3001→3004`, knowitall `3028→8025` (align dev script to registry).
- **.tinker.yaml `port`**: reconciled laudeslearning (3008), opsworx (3006), **sokospec (8021→8022)**, **oloplayground (8022→8031)**, rfpdoer (3002). Note: `.tinker.yaml` `port` is display-only — `scan-ports` never writes it back to the registry, so registry fixes are durable regardless.

### 4. Dashboard port-drift auto-detection (new feature)
- `src/lib/port-drift.ts` — `parseDevPort` (handles `-p`/`--port`/`${PORT:-N}`/orchestrator sub-scripts like `npm-run-all`→`dev:next`/framework defaults), `readDevPort`, `parseYamlPort`, `syncYamlPort`.
- `src/app/api/port-drift/route.ts` — GET returns per-project `{registryPort, configPort, configBasis, yamlPort}`; POST `{projectId, targetPort}` reconciles the registry port (collision-guarded) and syncs `.tinker.yaml`.
- `src/app/ports/page.tsx` — "Port Drift Detected" amber card. Client merges the live listening port (from `/api/scan-ports` `cwd` match) with config; `truthPort = livePort ?? configPort`; flags any registry/yaml disagreement; "Set to N" button calls the reconcile POST then refetches + rescans.

Verified via production build (`ƒ /api/port-drift` in the manifest) and a live `GET /api/port-drift` returning 47 configs with 0 drift.

## Files Modified

- `src/lib/port-drift.ts` - **New.** Port parsing + .tinker.yaml read/sync helpers.
- `src/app/api/port-drift/route.ts` - **New.** GET drift configs, POST collision-guarded reconcile.
- `src/app/ports/page.tsx` - Added Port Drift card, drift computation (config + live), reconcile handler.
- `scripts/port-audit.cjs` - **New.** Read-only registry-vs-package.json drift checker (CLI).
- `scripts/scan-tinker-yaml.cjs` - **New.** Read-only registry-vs-.tinker.yaml drift checker (CLI).
- `scripts/fix-ports.cjs`, `scripts/fix-pollinator.cjs` - **New.** One-off applied DB migrations (guarded, kept as record).
- `~/.tinker-launch/tinker.db` - Registry ports (laudeslearning, opsworx), new pollinator-front project, reassigned snapshots, rebuilt activityDaily. (Backups: `tinker.backup_20260624_133327.db`, `…_150223.db`.)
- `<repo>/.tinker.yaml` × 5, `<repo>/package.json` × 2 - Port reconciliation in other project repos.

## Key Takeaways

- **Truth priority for a project's port:** live lsof port (cwd match) > package.json `-p` > `.tinker.yaml`. `package.json -p` is not universal (Django has none; launcher/shell defaults vary).
- **Rematch gotcha:** `rematchUnmatched` only reprocesses `NULL projectId` snapshots. Fixing a registry port auto-repairs *unmatched* history, but snapshots mis-matched to the *wrong* project (port squatting) need manual reassignment + `activityDaily` rebuild.
- **activityDaily rebuild recipe:** `SUM(durationSeconds)/60` grouped by `date(timestamp/1000,'unixepoch','localtime')` + activityType, filtered to `source='window_tracker'` (validated identical to stored values). Never overwrite snapshot `org`/`chromeProfile` on reassignment.
- **Product↔repo names:** "Lifestylistic" = sokospec; "Pollinator" = pollinator-front (UI) + pollinator-api (Django backend).
- **Deploy gotcha:** the dashboard runs via `npm start` (`next start`, production), so new `app/api/*` routes require `npm run build` + restart — not just a dev reload.
- Left intentionally: Lifestylistic strays on 3100/3000 (mostly dead-server pings; real app is sokospec/8022), pollinator-api's own registry port 3028 (Django, current port unknowable from data), and `tally`/`play-again` `.tinker.yaml` missing a `port:` line (absent ≠ drift).
