# Project Search & Terminal Color Editing

**Date:** 2026-03-18
**Type:** Build Log

## Context

The All Projects settings page (`/settings/projects`) was missing a way to quickly filter projects by name, and there was no UI for editing the terminal background colors that are stored in each project's `.tinker.yaml`. Colors were only set via port scan auto-detection or manual YAML editing.

## What Changed

### Text Search on Projects Page

Added a search input in the header bar (next to "Show Archived" button) that filters projects across multiple fields: project name, repo name, org, description, aliases, and Linear slug. Uses `useMemo` for efficient client-side filtering.

### Terminal Color Editing in Edit Dialog

Added dark/light color pickers to the project edit dialog. Colors are read from and written back to each project's `.tinker.yaml` file (not the database), which means port scan respects manually-set colors and won't overwrite them.

**Flow:**
1. Opening the edit dialog fetches current colors from `/api/project-configs` (which reads `.tinker.yaml`)
2. Color swatches open native `<input type="color">` pickers
3. On save, hex values are converted to HSL and written to `.tinker.yaml` via `POST /api/project-configs`

### API Enhancement: POST /api/project-configs

New POST handler that writes terminal colors to a project's `.tinker.yaml`. Handles three cases:
- Existing YAML with terminal section — replaces it
- Existing YAML without terminal section — appends it
- No YAML file — creates `.tinker.yaml` with inferred name and colors

The GET handler was also enhanced to return both `darkColor` and `lightColor` separately (previously only returned a single `color`).

## Files Modified

- `src/app/settings/projects/page.tsx` - Added search input, color picker fields in edit dialog, `ColorPickerField` component, `colorToHex`/`hexToHsl` conversion helpers
- `src/app/api/project-configs/route.ts` - Added POST handler for writing colors to `.tinker.yaml`, enhanced GET to return dark/light separately

## Key Takeaways

- Terminal colors live in `.tinker.yaml` (per-project), not in the SQLite database — this is by design so port scan can read them
- Port scan's `autoUpdateTinkerYaml` checks for existing `dark` + `light` values and skips if both are present, so UI-set colors are safe
- The color picker converts between hex (native input format) and HSL (`.tinker.yaml` storage format)
