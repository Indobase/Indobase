#!/usr/bin/env bash
# Process Indobase Android bundle build requests from the Studio control plane.
# Supports one-shot execution (cron) and a long-running loop (systemd).
# The actual build is delegated to PROJECT_MOBILE_BUILD_EXECUTOR_COMMAND, which
# receives the claimed build payload via environment variables and may write a
# result JSON file describing the final status and produced artifacts.
set -euo pipefail

MODE="${1:-${PROJECT_MOBILE_BUILD_EXECUTOR_MODE:-once}}"
ENV_FILE="${PROJECT_MOBILE_BUILD_EXECUTOR_ENV_FILE:-/etc/indobase/project-mobile-build-executor.env}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

PROJECT_MOBILE_BUILD_EXECUTOR_URL="${PROJECT_MOBILE_BUILD_EXECUTOR_URL:-${STUDIO_URL:-${NEXT_PUBLIC_SITE_URL:-https://studio.indobase.in}}}"
PROJECT_MOBILE_BUILD_EXECUTOR_LIMIT="${PROJECT_MOBILE_BUILD_EXECUTOR_LIMIT:-1}"
PROJECT_MOBILE_BUILD_EXECUTOR_INTERVAL_MS="${PROJECT_MOBILE_BUILD_EXECUTOR_INTERVAL_MS:-10000}"
PROJECT_MOBILE_BUILD_EXECUTOR_IDLE_INTERVAL_MS="${PROJECT_MOBILE_BUILD_EXECUTOR_IDLE_INTERVAL_MS:-30000}"
PROJECT_MOBILE_BUILD_EXECUTOR_FAILURE_INTERVAL_MS="${PROJECT_MOBILE_BUILD_EXECUTOR_FAILURE_INTERVAL_MS:-15000}"
PROJECT_MOBILE_BUILD_EXECUTOR_HEARTBEAT_INTERVAL_MS="${PROJECT_MOBILE_BUILD_EXECUTOR_HEARTBEAT_INTERVAL_MS:-45000}"
PROJECT_MOBILE_BUILD_EXECUTOR_TIMEOUT_SECONDS="${PROJECT_MOBILE_BUILD_EXECUTOR_TIMEOUT_SECONDS:-60}"
PROJECT_MOBILE_BUILD_EXECUTOR_CONNECT_TIMEOUT_SECONDS="${PROJECT_MOBILE_BUILD_EXECUTOR_CONNECT_TIMEOUT_SECONDS:-10}"
PROJECT_MOBILE_BUILD_EXECUTOR_WORKER_ID="${PROJECT_MOBILE_BUILD_EXECUTOR_WORKER_ID:-$(hostname -s 2>/dev/null || hostname)-mobile-builds}"
PROJECT_MOBILE_BUILD_RUNTIME_SECRET="${PROJECT_MOBILE_BUILD_RUNTIME_SECRET:-${BUILDER_HANDOFF_SECRET:-${AUTH_JWT_SECRET:-${JWT_SECRET:-}}}}"
PROJECT_MOBILE_BUILD_EXECUTOR_COMMAND="${PROJECT_MOBILE_BUILD_EXECUTOR_COMMAND:-}"

if [[ -z "$PROJECT_MOBILE_BUILD_RUNTIME_SECRET" ]]; then
  echo "Missing PROJECT_MOBILE_BUILD_RUNTIME_SECRET (or fallback BUILDER_HANDOFF_SECRET/AUTH_JWT_SECRET/JWT_SECRET)" >&2
  exit 1
fi

if [[ ${#PROJECT_MOBILE_BUILD_RUNTIME_SECRET} -lt 32 ]]; then
  echo "PROJECT_MOBILE_BUILD_RUNTIME_SECRET must be at least 32 characters" >&2
  exit 1
fi

if ! [[ "$PROJECT_MOBILE_BUILD_EXECUTOR_LIMIT" =~ ^[0-9]+$ ]] || [[ "$PROJECT_MOBILE_BUILD_EXECUTOR_LIMIT" -lt 1 ]]; then
  echo "PROJECT_MOBILE_BUILD_EXECUTOR_LIMIT must be a positive integer" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for project-mobile-build-executor.sh" >&2
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
  python3 - "$body_file" <<'PY'
import json, sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text())
print(
    f"processed={payload.get('processed', 0)} "
    f"claimed={payload.get('claimed', 0)} "
    f"failed={payload.get('failed', 0)} "
    f"idle={str(payload.get('idle', False)).lower()}"
)
PY
}

extract_claimed_build() {
  local body_file="$1"
  python3 - "$body_file" <<'PY'
import json, sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text())
for result in payload.get("results", []):
    if result.get("outcome") == "claimed" and result.get("build"):
        print(json.dumps(result["build"]))
        raise SystemExit(0)
raise SystemExit(1)
PY
}

build_failure_result() {
  local output_file="$1"
  local exit_code="$2"
  local message="$3"
  python3 - "$output_file" "$exit_code" "$message" <<'PY'
import json, sys
from pathlib import Path

output_file, exit_code, message = sys.argv[1], int(sys.argv[2]), sys.argv[3]
payload = {
    "status": "failed",
    "log_message": message,
    "last_error": message,
    "metadata_patch": {
        "executor_result": {
            "exit_code": exit_code,
            "finished_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
            "ok": False,
        }
    },
}
Path(output_file).write_text(json.dumps(payload))
PY
}

normalize_result_payload() {
  local input_file="$1"
  local output_file="$2"
  python3 - "$input_file" "$output_file" <<'PY'
import json, sys
from pathlib import Path

input_file, output_file = Path(sys.argv[1]), Path(sys.argv[2])
payload = {}
if input_file.exists():
    raw = input_file.read_text().strip()
    if raw:
        payload = json.loads(raw)

status = payload.get("status") or "ready"
if status not in {"ready", "failed", "archived", "building"}:
    raise SystemExit(f"Invalid result status: {status}")

artifacts = payload.get("artifacts") or []
if not isinstance(artifacts, list):
    raise SystemExit("artifacts must be a list")

metadata_patch = payload.get("metadata_patch") or {}
if not isinstance(metadata_patch, dict):
    raise SystemExit("metadata_patch must be an object")

normalized = {
    "status": status,
    "log_level": payload.get("log_level"),
    "log_message": payload.get("log_message") or (
        "Android bundle build completed successfully"
        if status == "ready"
        else "Android bundle build failed"
    ),
    "last_error": payload.get("last_error"),
    "metadata_patch": metadata_patch,
    "artifacts": artifacts,
}

output_file.write_text(json.dumps(normalized))
PY
}

patch_build() {
  local project_ref="$1"
  local build_id="$2"
  local payload_file="$3"
  local body_file http_code
  body_file="$(mktemp)"

  if ! http_code="$(curl -sS \
    --connect-timeout "$PROJECT_MOBILE_BUILD_EXECUTOR_CONNECT_TIMEOUT_SECONDS" \
    --max-time "$PROJECT_MOBILE_BUILD_EXECUTOR_TIMEOUT_SECONDS" \
    -o "$body_file" \
    -w '%{http_code}' \
    -X PATCH "${PROJECT_MOBILE_BUILD_EXECUTOR_URL%/}/api/platform/projects/${project_ref}/mobile-builds/${build_id}" \
    -H "x-indobase-mobile-build-token: ${PROJECT_MOBILE_BUILD_RUNTIME_SECRET}" \
    -H 'Content-Type: application/json' \
    --data-binary "@${payload_file}")"; then
    echo "Failed to PATCH mobile build ${project_ref}/${build_id}" >&2
    cat "$body_file" >&2 || true
    rm -f "$body_file"
    return 1
  fi

  if [[ ! "$http_code" =~ ^2 ]]; then
    echo "Mobile build PATCH failed status=$http_code for ${project_ref}/${build_id}" >&2
    cat "$body_file" >&2 || true
    rm -f "$body_file"
    return 1
  fi

  rm -f "$body_file"
  return 0
}

send_heartbeat() {
  local project_ref="$1"
  local build_id="$2"
  local payload_file
  payload_file="$(mktemp)"
  cat >"$payload_file" <<EOF
{"heartbeat":true,"worker_id":"${PROJECT_MOBILE_BUILD_EXECUTOR_WORKER_ID}"}
EOF
  patch_build "$project_ref" "$build_id" "$payload_file" >/dev/null 2>&1 || true
  rm -f "$payload_file"
}

heartbeat_loop() {
  local project_ref="$1"
  local build_id="$2"
  local command_pid="$3"
  while kill -0 "$command_pid" >/dev/null 2>&1; do
    sleep_ms "$PROJECT_MOBILE_BUILD_EXECUTOR_HEARTBEAT_INTERVAL_MS"
    if kill -0 "$command_pid" >/dev/null 2>&1; then
      send_heartbeat "$project_ref" "$build_id"
    fi
  done
}

run_claimed_build() {
  local build_json="$1"
  local build_file result_file normalized_result_file command_log_file
  build_file="$(mktemp)"
  result_file="$(mktemp)"
  normalized_result_file="$(mktemp)"
  command_log_file="$(mktemp)"
  printf '%s' "$build_json" >"$build_file"

  local project_ref build_id
  project_ref="$(python3 - "$build_file" <<'PY'
import json, sys
from pathlib import Path
payload = json.loads(Path(sys.argv[1]).read_text())
print(payload["project_ref"])
PY
)"
  build_id="$(python3 - "$build_file" <<'PY'
import json, sys
from pathlib import Path
payload = json.loads(Path(sys.argv[1]).read_text())
print(payload["id"])
PY
)"

  if [[ -z "$PROJECT_MOBILE_BUILD_EXECUTOR_COMMAND" ]]; then
    build_failure_result \
      "$result_file" \
      127 \
      "PROJECT_MOBILE_BUILD_EXECUTOR_COMMAND is not configured"
    normalize_result_payload "$result_file" "$normalized_result_file"
    patch_build "$project_ref" "$build_id" "$normalized_result_file"
    rm -f "$build_file" "$result_file" "$normalized_result_file" "$command_log_file"
    return 1
  fi

  export INDOBASE_MOBILE_BUILD_JSON_FILE="$build_file"
  export INDOBASE_MOBILE_BUILD_RESULT_FILE="$result_file"
  export INDOBASE_MOBILE_BUILD_LOG_FILE="$command_log_file"
  export INDOBASE_MOBILE_BUILD_ID="$build_id"
  export INDOBASE_MOBILE_BUILD_PROJECT_REF="$project_ref"
  export INDOBASE_MOBILE_BUILD_WORKER_ID="$PROJECT_MOBILE_BUILD_EXECUTOR_WORKER_ID"
  export INDOBASE_MOBILE_BUILD_API_BASE="${PROJECT_MOBILE_BUILD_EXECUTOR_URL%/}"
  export INDOBASE_MOBILE_BUILD_RUNTIME_TOKEN="$PROJECT_MOBILE_BUILD_RUNTIME_SECRET"

  set +e
  bash -lc "$PROJECT_MOBILE_BUILD_EXECUTOR_COMMAND" >>"$command_log_file" 2>&1 &
  local command_pid=$!
  heartbeat_loop "$project_ref" "$build_id" "$command_pid" &
  local heartbeat_pid=$!
  wait "$command_pid"
  local command_exit_code=$?
  kill "$heartbeat_pid" >/dev/null 2>&1 || true
  wait "$heartbeat_pid" >/dev/null 2>&1 || true
  set -e

  if [[ "$command_exit_code" -ne 0 ]]; then
    local failure_message="Android bundle executor command failed with exit code ${command_exit_code}"
    if [[ -s "$command_log_file" ]]; then
      failure_message="${failure_message}: $(tail -n 1 "$command_log_file" | tr -d '\r' | cut -c1-400)"
    fi
    build_failure_result "$result_file" "$command_exit_code" "$failure_message"
  fi

  normalize_result_payload "$result_file" "$normalized_result_file"
  patch_build "$project_ref" "$build_id" "$normalized_result_file"
  local patch_exit_code=$?

  rm -f "$build_file" "$result_file" "$normalized_result_file" "$command_log_file"
  return "$patch_exit_code"
}

run_once() {
  local body_file http_code timestamp
  body_file="$(mktemp)"
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if ! http_code="$(curl -sS \
    --connect-timeout "$PROJECT_MOBILE_BUILD_EXECUTOR_CONNECT_TIMEOUT_SECONDS" \
    --max-time "$PROJECT_MOBILE_BUILD_EXECUTOR_TIMEOUT_SECONDS" \
    -o "$body_file" \
    -w '%{http_code}' \
    -X POST "${PROJECT_MOBILE_BUILD_EXECUTOR_URL%/}/api/platform/mobile-builds/process" \
    -H "x-indobase-mobile-build-token: ${PROJECT_MOBILE_BUILD_RUNTIME_SECRET}" \
    -H 'Content-Type: application/json' \
    -d "{\"limit\":${PROJECT_MOBILE_BUILD_EXECUTOR_LIMIT},\"worker_id\":\"${PROJECT_MOBILE_BUILD_EXECUTOR_WORKER_ID}\"}")"; then
    echo "[$timestamp] mobile build executor request failed before receiving an HTTP status" >&2
    cat "$body_file" >&2 || true
    rm -f "$body_file"
    return 1
  fi

  if [[ ! "$http_code" =~ ^2 ]]; then
    echo "[$timestamp] mobile build executor request failed status=$http_code" >&2
    cat "$body_file" >&2 || true
    rm -f "$body_file"
    return 1
  fi

  echo "[$timestamp] $(log_summary "$body_file")"

  local claimed_build_json
  if claimed_build_json="$(extract_claimed_build "$body_file" 2>/dev/null)"; then
    rm -f "$body_file"
    if run_claimed_build "$claimed_build_json"; then
      return 10
    fi
    return 1
  fi

  local idle
  idle="$(python3 - "$body_file" <<'PY'
import json, sys
from pathlib import Path
payload = json.loads(Path(sys.argv[1]).read_text())
print("true" if payload.get("idle") else "false")
PY
)"
  rm -f "$body_file"

  if [[ "$idle" == "true" ]]; then
    return 0
  fi

  return 10
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

echo "Starting project mobile build executor loop worker_id=${PROJECT_MOBILE_BUILD_EXECUTOR_WORKER_ID} url=${PROJECT_MOBILE_BUILD_EXECUTOR_URL%/}"
while [[ "$shutdown_requested" -eq 0 ]]; do
  set +e
  run_once
  exit_code=$?
  set -e

  if [[ "$exit_code" -eq 0 ]]; then
    sleep_ms "$PROJECT_MOBILE_BUILD_EXECUTOR_IDLE_INTERVAL_MS"
    continue
  fi

  if [[ "$exit_code" -eq 10 ]]; then
    sleep_ms "$PROJECT_MOBILE_BUILD_EXECUTOR_INTERVAL_MS"
  else
    echo "Executor loop sleeping after failure exit_code=$exit_code" >&2
    sleep_ms "$PROJECT_MOBILE_BUILD_EXECUTOR_FAILURE_INTERVAL_MS"
  fi
done

echo "Stopping project mobile build executor loop"
