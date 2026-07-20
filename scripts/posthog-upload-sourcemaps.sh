#!/usr/bin/env bash
# Upload production source maps to PostHog for stack-trace symbolication.
# Requires: @posthog/cli, POSTHOG_CLI_API_KEY, POSTHOG_CLI_PROJECT_ID
# Optional: POSTHOG_CLI_HOST (default https://us.posthog.com)
set -euo pipefail

APP="${1:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -z "$APP" ]]; then
  echo "Usage: $0 <www|builder|studio>" >&2
  exit 1
fi

if ! command -v posthog-cli >/dev/null 2>&1; then
  echo "posthog-cli not found. Install: npm install -g @posthog/cli" >&2
  exit 1
fi

if [[ -z "${POSTHOG_CLI_API_KEY:-}" || -z "${POSTHOG_CLI_PROJECT_ID:-}" ]]; then
  echo "Set POSTHOG_CLI_API_KEY and POSTHOG_CLI_PROJECT_ID" >&2
  exit 1
fi

CLI_ARGS=()
if [[ -n "${POSTHOG_CLI_HOST:-}" ]]; then
  CLI_ARGS+=(--host "$POSTHOG_CLI_HOST")
fi

case "$APP" in
  www)
    DIR="$ROOT/apps/www/build"
    ;;
  builder)
    DIR="$ROOT/indobase-builder/build/client"
    ;;
  studio)
    DIR="$ROOT/apps/studio/.next"
    ;;
  *)
    echo "Unknown app: $APP (use www, builder, or studio)" >&2
    exit 1
    ;;
esac

if [[ ! -d "$DIR" ]]; then
  echo "Build output not found: $DIR (run production build first)" >&2
  exit 1
fi

posthog-cli "${CLI_ARGS[@]}" sourcemap inject --directory "$DIR"
posthog-cli "${CLI_ARGS[@]}" sourcemap upload --directory "$DIR" --delete-after

echo "Uploaded source maps for $APP from $DIR"
