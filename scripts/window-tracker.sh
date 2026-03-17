#!/bin/bash
#
# Window focus tracking daemon for Tinker Launch.
# Polls every 10 seconds for the frontmost application and its window title,
# appending JSONL entries to ~/.tinker-launch/activity/window-focus.jsonl.
#

DATA_DIR="$HOME/.tinker-launch/activity"
OUTPUT_FILE="$DATA_DIR/window-focus.jsonl"
POLL_INTERVAL=10

mkdir -p "$DATA_DIR"
echo "Window tracker started. Writing to $OUTPUT_FILE" >&2

cleanup() {
  echo "Window tracker shut down cleanly." >&2
  exit 0
}
trap cleanup SIGTERM SIGINT

json_escape() {
  # Escape backslashes, double quotes, and control characters for JSON
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/	/\\t/g'
}

while true; do
  result=$(osascript -e '
    use framework "AppKit"
    -- Use NSWorkspace for reliable frontmost detection (System Events "frontmost" is buggy with Chrome)
    set activeApp to current application'\''s NSWorkspace'\''s sharedWorkspace()'\''s frontmostApplication()
    set appName to activeApp'\''s localizedName() as text
    set bundleId to activeApp'\''s bundleIdentifier() as text
    -- Get window title via System Events (NSWorkspace does not expose window titles)
    set windowTitle to ""
    tell application "System Events"
      try
        set windowTitle to name of first window of (first application process whose bundle identifier is bundleId)
      end try
    end tell
    return appName & "\n" & bundleId & "\n" & windowTitle
  ' 2>/dev/null)

  if [ $? -eq 0 ] && [ -n "$result" ]; then
    app=$(echo "$result" | sed -n '1p')
    bundleId=$(echo "$result" | sed -n '2p')
    windowTitle=$(echo "$result" | sed -n '3p')

    # Skip private/incognito browser windows
    skip=false
    case "$bundleId" in
      com.google.Chrome|com.brave.Browser|company.thebrowser.Browser|com.operasoftware.Opera)
        case "$windowTitle" in
          *"(Incognito)"*|*"(Private)"*) skip=true ;;
        esac
        ;;
    esac

    if [ "$skip" = false ]; then
      timestamp=$(($(date +%s) * 1000))

      # Capture URL for browser windows
      url=""
      case "$bundleId" in
        com.google.Chrome)
          url=$(osascript -e 'tell application "Google Chrome" to get URL of active tab of front window' 2>/dev/null) ;;
        com.brave.Browser)
          url=$(osascript -e 'tell application "Brave Browser" to get URL of active tab of front window' 2>/dev/null) ;;
        com.apple.Safari)
          url=$(osascript -e 'tell application "Safari" to get URL of current tab of front window' 2>/dev/null) ;;
        company.thebrowser.Browser)
          url=$(osascript -e 'tell application "Arc" to get URL of active tab of front window' 2>/dev/null) ;;
      esac

      if [ -n "$url" ]; then
        echo "{\"timestamp\":$timestamp,\"app\":\"$(json_escape "$app")\",\"windowTitle\":\"$(json_escape "$windowTitle")\",\"bundleId\":\"$(json_escape "$bundleId")\",\"url\":\"$(json_escape "$url")\"}" >> "$OUTPUT_FILE"
      else
        echo "{\"timestamp\":$timestamp,\"app\":\"$(json_escape "$app")\",\"windowTitle\":\"$(json_escape "$windowTitle")\",\"bundleId\":\"$(json_escape "$bundleId")\"}" >> "$OUTPUT_FILE"
      fi
    fi
  fi

  sleep "$POLL_INTERVAL" &
  wait $!
done
