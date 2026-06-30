# Fix Chrome Multi-Profile Window Tracking Mismatch

**Date:** 2026-03-18
**Type:** Build Log

## Context

Activity tracking was massively over-attributing browser time to Park Bench (and other projects). Today alone, 533 browser_local snapshots were attributed to Park Bench — but most were actually Gmail, Google Drive, Webflow, Linear, and other unrelated sites. The root cause was a fundamental mismatch between how the window tracker captured window titles vs URLs when multiple Chrome profiles are open.

## What Changed

### Root Cause: Chrome AppleScript API vs System Events Disagree

The window tracker used two separate APIs:
- **System Events** for the window title — reports the actually-focused window across all Chrome profiles (correct)
- **Chrome's AppleScript API** (`tell application "Google Chrome"`) for the URL — only sees windows from ONE profile

With 3 Chrome profiles open (Todd, ToddMinima, super.green), the URL often came from a different profile's window than the one actually focused. Example: title says "Inbox - Gmail - todd (super.green)" but URL says `http://localhost:3010/chat` (Park Bench's port, from the ToddMinima profile). Port-based matching then incorrectly attributed the snapshot to Park Bench.

### Fix 1: Window Tracker URL Validation (`scripts/window-tracker.sh`)

Now fetches both `title of active tab` and `URL of active tab` from Chrome's API, then only uses the URL if the Chrome tab title appears in the System Events window title. If they don't match (different profile/window), the URL is omitted entirely.

### Fix 2: Remove Title-Based Browser Fallback (`src/lib/activity.ts`)

Removed the title-based fallback matching in `matchBrowser()`. Previously, if no URL was available, the code would try to match browser window titles against project names, repo names, and aliases using whole-word matching. This produced false positives (e.g., "Park Bench" appearing in a Linear issue title). Browser snapshots now only match projects via URL. No data is better than bad data.

Also removed the now-unused `classifyBrowserContext()` helper function.

### Fix 3: SQLite Data Cleanup

Un-attributed 480 mismatched browser snapshots across all days where the window title didn't relate to the attributed project (title didn't contain the project name, repo name, or prod URL domain). Rebuilt `activityDaily` aggregates from corrected snapshots.

## Files Modified

- `scripts/window-tracker.sh` - Chrome URL capture now validates against System Events title before using
- `src/lib/activity.ts` - Removed `matchBrowser` title-based fallback and `classifyBrowserContext` function

## Key Takeaways

- Chrome's AppleScript API is per-profile — `tell application "Google Chrome"` only sees one profile's windows, even when multiple profiles have windows open
- System Events sees all Chrome windows correctly (with profile suffix in title like `" - Google Chrome - Todd (ToddMinima)"`)
- For multi-profile Chrome setups, never trust that "front window" means the same thing across these two APIs
- Safari and Arc don't have the multi-profile problem, so their URL capture remains simple
- The Chrome profile suffix in the System Events title (parsed by `parseChromeProfileOrg`) is still used for org-level attribution — that part works correctly
