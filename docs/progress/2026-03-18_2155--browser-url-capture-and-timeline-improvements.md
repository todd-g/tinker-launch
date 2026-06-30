# Fix Chrome Multi-Profile URL Capture & Timeline UX Improvements

**Date:** 2026-03-18
**Type:** Build Log

## Context

The window tracker daemon was producing false project matches for browser activity. Chrome's AppleScript API (`tell application "Google Chrome"`) only sees windows from one profile, so when a user had multiple Chrome profiles open (e.g., Todd, ToddMinima, super.green), the URL could come from the wrong profile's window. A title-matching guard was in place but failed on empty titles and substring collisions. Additionally, the timeline view needed UX improvements: better type filtering, real brand icons, and cleaner tooltips.

## What Changed

### 1. Browser URL Capture — Accessibility API Approach

Replaced Chrome's AppleScript URL API with a System Events accessibility approach that reads the URL directly from the browser's address bar (`AXTextField [Address and search bar]`). This is profile-agnostic — it always reads from the actual focused window.

- **`scripts/window-tracker.sh`** — Removed `tell application "Google Chrome"` URL fetching and title-matching guard. Replaced with JXA (JavaScript for Automation) that recursively walks the Chrome window's UI tree via System Events to find the address bar text field.
- The address bar returns display URLs without scheme, so the script prepends `http://` for localhost and `https://` for everything else.
- Key discovery: the AXTextField is at **depth 9** in Chrome's UI tree (Window > Group > Group > Group > Group > Toolbar > Group > Group > TextField). Initial depth limit of 8 caused silent failures. Set to 12 for safety margin.
- The address bar is only accessible when Chrome is the frontmost app, which is exactly when the daemon polls — so this is a feature, not a bug.
- Also required wrapping JXA code in a `function run() {}` for proper osascript execution from LaunchAgent context.

### 2. Purged Historical Browser Data

All prior browser snapshots (1,569 rows across browser_local/prod/staging) were deleted from `activitySnapshots` and `activityDaily` because they were captured with the unreliable old method. Browser minutes zeroed out in daily rollups. Clean slate for the new accurate data.

### 3. Timeline Display Filters

Replaced the static color legend with interactive toggle pills. Each activity type gets a clickable button with the real brand icon. Clicking toggles visibility — hidden types get dimmed and their blocks disappear from the timeline. Entry count shows `visible / total` when filtering is active.

State: `hiddenTypes: Set<string>` filters `visibleSnapshots` before grouping into rows.

### 4. Real Brand Icons in Timeline

Downloaded actual favicons and saved to `public/icons/`:
- `chrome.png` — Chrome logo (browser_local/staging/prod)
- `slack.png` — Slack logo
- `claude.ico` — Claude favicon (CC turns)
- `zoom.ico` — Zoom favicon (meetings)
- `xcode.png` — Apple developer icon
- `gmail.ico` — Gmail favicon
- `gdocs.ico` — Google Docs favicon
- `figma.png` — Figma favicon
- `terminal.svg` — Custom SVG (green prompt on dark background)

Icons appear in both the filter toggle pills (14px) and hover tooltips (18px).

### 5. Tooltip Improvements

- **Fixed positioning**: Tooltip uses `position: fixed` with `getBoundingClientRect()` so it renders outside the overflow-hidden scroll container. No more clipping on lower rows.
- **Simplified content**: Icon + duration on header line (no type label — icon is enough). Contextual detail below: URL for browser, cleaned window title for Slack/meetings, user chars for CC turns.
- **Narrower width**: Reduced from `w-64` (256px) to `max-w-52` (208px).

### 6. Sticky Column Fix

Moved `overflow-x-auto` from a nested div up to the card container itself, creating a single scroll context. The sticky left column no longer escapes its container and overlaps the toolbar/filters above.

### 7. New Activity Types: Gmail, Google Docs, Figma

Added three new activity types to break out common "other" browser activity:
- `browser_email` — `mail.google.com` URLs or "Gmail" in window title
- `browser_docs` — Google Docs/Sheets/Slides/Drive URLs or title match
- `browser_figma` — `figma.com` URLs or "Figma" in title

Detection happens in `matchBrowser()` via `classifyBrowserTool()` (URL-based) with `classifyBrowserToolFromTitle()` fallback. Updated `MatchResult` type union to include new types. Reclassified 275 historical "other" snapshots via SQL UPDATE.

## Files Modified

- `scripts/window-tracker.sh` — Replaced Chrome AppleScript URL capture with JXA accessibility approach
- `src/lib/activity.ts` — Added `classifyBrowserTool()`, `classifyBrowserToolFromTitle()`, new activity types in `MatchResult`
- `src/app/activity/timeline/page.tsx` — Filter toggles, real icons, fixed tooltip positioning, simplified tooltip content, sticky column fix, new type colors/labels/icons
- `public/icons/` — Added 9 icon files (chrome, slack, claude, zoom, xcode, gmail, gdocs, figma, terminal)

## Key Takeaways

- Chrome's AppleScript API is fundamentally broken for multi-profile setups — it only exposes one profile's windows. The accessibility/UI scripting approach via System Events is the reliable path.
- The AXTextField depth in Chrome's UI tree is not stable across versions. Using a generous depth limit (12) with recursive search is safer than hardcoding the path.
- `osascript -l JavaScript` requires a `function run() {}` wrapper when executed from LaunchAgent/daemon context — bare top-level expressions silently fail.
- The address bar only exposes its value when Chrome is frontmost, which aligns perfectly with how the daemon works (it only polls the focused app).
- Title-based fallback matching for Gmail/Docs/Figma is valuable because the address bar URL capture can still fail silently in edge cases.
