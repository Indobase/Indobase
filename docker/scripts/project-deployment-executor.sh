#!/usr/bin/env bash
# Process Indobase project deployment requests from the Studio control plane.
# Supports both one-shot execution (cron) and a long-running loop (systemd).
set -euo pipefail

MODE="${1:-${PROJECT_DEPLOYMENT_EXECUTOR_MODE:-once}}"
ENV_FILE="${PROJECT_DEPLOYMENT_EXECUTOR_ENV_FILE:-/etc/indobase/project-deployment-executor.env}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

PROJECT_DEPLOYMENT_EXECUTOR_URL="${PROJECT_DEPLOYMENT_EXECUTOR_URL:-${STUDIO_URL:-${NEXT_PUBLIC_SITE_URL:-https://studio.indobase.in}}}"
PROJECT_DEPLOYMENT_EXECUTOR_LIMIT="${PROJECT_DEPLOYMENT_EXECUTOR_LIMIT:-5}"
PROJECT_DEPLOYMENT_EXECUTOR_INTERVAL_MS="${PROJECT_DEPLOYMENT_EXECUTOR_INTERVAL_MS:-10000}"
PROJECT_DEPLOYMENT_EXECUTOR_IDLE_INTERVAL_MS="${PROJECT_DEPLOYMENT_EXECUTOR_IDLE_INTERVAL_MS:-30000}"
PROJECT_DEPLOYMENT_EXECUTOR_FAILURE_INTERVAL_MS="${PROJECT_DEPLOYMENT_EXECUTOR_FAILURE_INTERVAL_MS:-15000}"
PROJECT_DEPLOYMENT_EXECUTOR_TIMEOUT_SECONDS="${PROJECT_DEPLOYMENT_EXECUTOR_TIMEOUT_SECONDS:-30}"
PROJECT_DEPLOYMENT_EXECUTOR_CONNECT_TIMEOUT_SECONDS="${PROJECT_DEPLOYMENT_EXECUTOR_CONNECT_TIMEOUT_SECONDS:-10}"
PROJECT_DEPLOYMENT_EXECUTOR_WORKER_ID="${PROJECT_DEPLOYMENT_EXECUTOR_WORKER_ID:-$(hostname -s 2>/dev/null || hostname)-project-deployments}"
PROJECT_DEPLOYMENT_RUNTIME_SECRET="${PROJECT_DEPLOYMENT_RUNTIME_SECRET:-${BUILDER_HANDOFF_SECRET:-${AUTH_JWT_SECRET:-${JWT_SECRET:-}}}}"

if [[ -z "$PROJECT_DEPLOYMENT_RUNTIME_SECRET" ]]; then
  echo "Missing PROJECT_DEPLOYMENT_RUNTIME_SECRET (or fallback BUILDER_HANDOFF_SECRET/AUTH_JWT_SECRET/JWT_SECRET)" >&2
  exit 1
fi

if [[ ${#PROJECT_DEPLOYMENT_RUNTIME_SECRET} -lt 32 ]]; then
  echo "PROJECT_DEPLOYMENT_RUNTIME_SECRET must be at least 32 characters" >&2
  exit 1
fi

if ! [[ "$PROJECT_DEPLOYMENT_EXECUTOR_LIMIT" =~ ^[0-9]+$ ]] || [[ "$PROJECT_DEPLOYMENT_EXECUTOR_LIMIT" -lt 1 ]]; then
  echo "PROJECT_DEPLOYMENT_EXECUTOR_LIMIT must be a positive integer" >&2
  exit 1
fi

mode_name() {
  case "$MODE" in
    once|--once) echo "once" ;;
    loop|--loop) echo "loop" ;;
    *)
      echo "Usage: $0 [--once|--loop]" >&2
      exit 1
      ;;
  esac
}

sleep_ms() {
  local delay_ms="$1"
  python3 - "$delay_ms" <<'PY'
import sys, time
delay_ms = int(sys.argv[1])
time.sleep(max(delay_ms, 0) / 1000)
PY
}

log_summary() {
  local body_file="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$body_file" <<'PY'
import json, sys
from pathlib import Path

body = Path(sys.argv[1]).read_text()
payload = json.loads(body)
print(
    f"processed={payload.get('processed', 0)} "
    f"ready={payload.get('ready', 0)} "
    f"failed={payload.get('failed', 0)} "
    f"idle={str(payload.get('idle', False)).lower()}"
)
PY
  else
    cat "$body_file"
  fi
}

run_once() {
  local body_file http_code timestamp
  body_file="$(mktemp)"
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if ! http_code="$(curl -sS \
    --connect-timeout "$PROJECT_DEPLOYMENT_EXECUTOR_CONNECT_TIMEOUT_SECONDS" \
    --max-time "$PROJECT_DEPLOYMENT_EXECUTOR_TIMEOUT_SECONDS" \
    -o "$body_file" \
    -w '%{http_code}' \
    -X POST "${PROJECT_DEPLOYMENT_EXECUTOR_URL%/}/api/platform/deployments/process" \
    -H "x-indobase-deployment-token: ${PROJECT_DEPLOYMENT_RUNTIME_SECRET}" \
    -H 'Content-Type: application/json' \
    -d "{\"limit\":${PROJECT_DEPLOYMENT_EXECUTOR_LIMIT},\"worker_id\":\"${PROJECT_DEPLOYMENT_EXECUTOR_WORKER_ID}\"}")"; then
    echo "[$timestamp] project deployment executor request failed before receiving an HTTP status" >&2
    cat "$body_file" >&2 || true
    rm -f "$body_file"
    return 1
  fi

  if [[ ! "$http_code" =~ ^2 ]]; then
    echo "[$timestamp] project deployment executor request failed status=$http_code" >&2
    cat "$body_file" >&2 || true
    rm -f "$body_file"
    return 1
  fi

  echo "[$timestamp] $(log_summary "$body_file")"
  if command -v python3 >/dev/null 2>&1; then
    set +e
    python3 - "$body_file" <<'PY'
import json, sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text())
if payload.get("idle"):
    raise SystemExit(0)
raise SystemExit(10 if payload.get("processed", 0) > 0 else 0)
PY
    local exit_code=$?
    set -e
    rm -f "$body_file"
    return "$exit_code"
  fi

  rm -f "$body_file"
  return 0
}

shutdown_requested=0
trap 'shutdown_requested=1' INT TERM

MODE="$(mode_name)"

if [[ "$MODE" == "once" ]]; then
  set +e
  run_once
  exit_code=$?
  set -e
  exit "$exit_code"
fi

echo "Starting project deployment executor loop worker_id=${PROJECT_DEPLOYMENT_EXECUTOR_WORKER_ID} url=${PROJECT_DEPLOYMENT_EXECUTOR_URL%/}"
while [[ "$shutdown_requested" -eq 0 ]]; do
  set +e
  run_once
  exit_code=$?
  set -e

  if [[ "$exit_code" -eq 0 ]]; then
    sleep_ms "$PROJECT_DEPLOYMENT_EXECUTOR_IDLE_INTERVAL_MS"
    continue
  fi

  if [[ "$exit_code" -eq 10 ]]; then
    sleep_ms "$PROJECT_DEPLOYMENT_EXECUTOR_INTERVAL_MS"
  else
    echo "Executor loop sleeping after failure exit_code=$exit_code" >&2
    sleep_ms "$PROJECT_DEPLOYMENT_EXECUTOR_FAILURE_INTERVAL_MS"
  fi
done

echo "Stopping project deployment executor loop"
