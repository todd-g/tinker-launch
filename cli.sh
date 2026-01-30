#!/bin/bash
# Tinker Launch CLI wrapper
# Sources .envrc and executes the provided command with those environment variables

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/.envrc"

# Vercel CLI requires explicit --token flag (doesn't use VERCEL_TOKEN env var)
if [[ "$1" == "vercel" ]]; then
  shift
  exec vercel --token "$VERCEL_TOKEN" "$@"
fi

exec "$@"
