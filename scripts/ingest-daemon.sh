#!/bin/bash
# Tinker Launch — background ingestion daemon
# Runs every 5 minutes: triggers window ingest + CC parse via local API

DASHBOARD_URL="http://localhost:3001"
LOG_PREFIX="[tinker-launch ingest]"

while true; do
  # Window ingest
  curl -s -X GET "$DASHBOARD_URL/api/db/activity" -o /dev/null 2>&1 \
    && echo "$LOG_PREFIX $(date -u +%Y-%m-%dT%H:%M:%SZ) window ingest OK" \
    || echo "$LOG_PREFIX $(date -u +%Y-%m-%dT%H:%M:%SZ) window ingest failed (dashboard may be down)"

  # CC parse
  curl -s -X GET "$DASHBOARD_URL/api/db/cc-usage" -o /dev/null 2>&1 \
    && echo "$LOG_PREFIX $(date -u +%Y-%m-%dT%H:%M:%SZ) cc parse OK" \
    || echo "$LOG_PREFIX $(date -u +%Y-%m-%dT%H:%M:%SZ) cc parse failed (dashboard may be down)"

  sleep 300
done
