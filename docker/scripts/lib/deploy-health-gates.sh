#!/usr/bin/env bash
# Health/readiness gates for deploy smoke tests.

deploy_health_json_field() {
  local file="$1"
  local field="$2"
  python3 -c "import json,sys; v=json.load(open(sys.argv[1])).get(sys.argv[2], ''); print(str(v).lower() if isinstance(v, bool) else v)" "$file" "$field" 2>/dev/null || true
}

# Wait until url returns HTTP 200 and optional JSON field equals expected_value.
deploy_wait_for_http_json() {
  local url="$1"
  local json_field="${2:-}"
  local expected_value="${3:-}"
  local max_attempts="${4:-18}"
  local sleep_seconds="${5:-10}"
  local tmp_file="${6:-/tmp/deploy-health-gate.json}"

  local attempt http_code actual

  for attempt in $(seq 1 "$max_attempts"); do
    http_code="$(curl -sS -o "$tmp_file" -w '%{http_code}' --max-time 15 "$url" 2>/dev/null || echo 000)"
    if [[ "$http_code" == "200" ]]; then
      if [[ -n "$json_field" && -n "$expected_value" ]]; then
        actual="$(deploy_health_json_field "$tmp_file" "$json_field")"
        if [[ "$actual" == "$expected_value" ]]; then
          echo "ready ${url} (${json_field}=${actual}, attempt ${attempt})"
          return 0
        fi
        echo "attempt ${attempt}: ${url} http=200 but ${json_field}=${actual:-<empty>} expected ${expected_value}"
      else
        echo "ready ${url} (attempt ${attempt})"
        return 0
      fi
    else
      echo "attempt ${attempt}: ${url} http=${http_code}"
    fi
    sleep "$sleep_seconds"
  done

  echo "not ready: ${url} after ${max_attempts} attempts" >&2
  return 1
}

# Builder: require /api/health/ready before accepting traffic; confirm SHA via /live.
deploy_wait_for_builder_rollout() {
  local base_url="$1"
  local expected_sha="${2:-}"
  local max_attempts="${3:-18}"

  deploy_wait_for_http_json "${base_url%/}/api/health/ready" ready true "$max_attempts" 10 /tmp/builder-health-ready.json

  if [[ -n "$expected_sha" ]]; then
    deploy_wait_for_http_json "${base_url%/}/api/health/live" version "$expected_sha" "$max_attempts" 10 /tmp/builder-health-live.json
  fi
}

# Studio: /api/health/live is liveness-only; gate on /api/health when possible.
deploy_wait_for_studio_rollout() {
  local base_url="$1"
  local expected_sha="${2:-}"
  local max_attempts="${3:-18}"

  if deploy_wait_for_http_json "${base_url%/}/api/health" status ok "$max_attempts" 10 /tmp/studio-health.json; then
    :
  else
    echo "WARN: Studio /api/health not fully ok — falling back to /api/health/live" >&2
    deploy_wait_for_http_json "${base_url%/}/api/health/live" "" "" "$max_attempts" 10 /tmp/studio-health-live.json
  fi

  if [[ -n "$expected_sha" ]]; then
    deploy_wait_for_http_json "${base_url%/}/api/health/live" version "$expected_sha" "$max_attempts" 10 /tmp/studio-health-live.json
  fi
}
