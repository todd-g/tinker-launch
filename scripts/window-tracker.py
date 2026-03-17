#!/usr/bin/env python3
"""
Window focus tracking daemon for Tinker Launch.

Polls every 10 seconds for the frontmost application and its window title,
appending JSONL entries to ~/.tinker-launch/activity/window-focus.jsonl.
"""

import json
import os
import signal
import subprocess
import sys
import time

DATA_DIR = os.path.expanduser("~/.tinker-launch/activity")
OUTPUT_FILE = os.path.join(DATA_DIR, "window-focus.jsonl")
POLL_INTERVAL = 10

# Private/incognito bundle IDs and window title markers
PRIVATE_BROWSER_BUNDLE_IDS = {
    "com.google.Chrome",
    "com.brave.Browser",
    "company.thebrowser.Browser",
    "com.operasoftware.Opera",
}
PRIVATE_WINDOW_MARKERS = ("(Incognito)", "(Private)")

# AppleScript to get frontmost app info
APPLESCRIPT = """
tell application "System Events"
    set frontApp to first application process whose frontmost is true
    set appName to name of frontApp
    set bundleId to bundle identifier of frontApp
    set windowTitle to ""
    try
        set windowTitle to name of first window of frontApp
    end try
end tell
return appName & "\n" & bundleId & "\n" & windowTitle
"""

shutdown_requested = False


def handle_signal(signum, frame):
    global shutdown_requested
    print(f"Received signal {signum}, shutting down...", file=sys.stderr)
    shutdown_requested = True


def get_frontmost_app():
    """Get frontmost app name, bundle ID, and window title via osascript."""
    try:
        result = subprocess.run(
            ["osascript", "-e", APPLESCRIPT],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            return None

        lines = result.stdout.strip().split("\n")
        if len(lines) < 2:
            return None

        app_name = lines[0].strip()
        bundle_id = lines[1].strip()
        window_title = lines[2].strip() if len(lines) > 2 else ""

        return {
            "app": app_name,
            "bundleId": bundle_id,
            "windowTitle": window_title,
        }
    except (subprocess.TimeoutExpired, Exception) as e:
        print(f"Error getting frontmost app: {e}", file=sys.stderr)
        return None


def is_private_browsing(bundle_id, window_title):
    """Check if the current window is a private/incognito browser window."""
    if bundle_id not in PRIVATE_BROWSER_BUNDLE_IDS:
        return False
    for marker in PRIVATE_WINDOW_MARKERS:
        if marker in window_title:
            return True
    return False


def append_entry(entry):
    """Append a JSONL entry to the output file."""
    with open(OUTPUT_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")


def main():
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    os.makedirs(DATA_DIR, exist_ok=True)

    print(f"Window tracker started. Writing to {OUTPUT_FILE}", file=sys.stderr)

    while not shutdown_requested:
        info = get_frontmost_app()

        if info is not None:
            if not is_private_browsing(info["bundleId"], info["windowTitle"]):
                entry = {
                    "timestamp": int(time.time() * 1000),
                    "app": info["app"],
                    "windowTitle": info["windowTitle"],
                    "bundleId": info["bundleId"],
                }
                append_entry(entry)

        # Sleep in small increments so we can respond to signals promptly
        for _ in range(POLL_INTERVAL):
            if shutdown_requested:
                break
            time.sleep(1)

    print("Window tracker shut down cleanly.", file=sys.stderr)


if __name__ == "__main__":
    main()
