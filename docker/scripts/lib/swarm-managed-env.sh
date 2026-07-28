#!/usr/bin/env bash
# Shared helpers for Swarm services backed by managed env files on disk.
#
# Docker Swarm `service update` does not accept --env-file; env vars loaded at
# create time are not refreshed when the file changes. Call swarm_apply_env_file
# after upserting keys on disk to push the file back into the service spec.

swarm_discover_service() {
  local filter="${1:-}"
  if [[ -z "$filter" ]]; then
    return 1
  fi
  docker service ls --format '{{.Name}}' | grep -E "$filter" | head -1 || true
}

swarm_upsert_env_file_kv() {
  local file="$1" key="$2" value="$3"
  touch "$file"
  chmod 600 "$file"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    local escaped
    escaped=$(printf '%s' "$value" | sed -e 's/[\\/&]/\\&/g')
    sed -i "s|^${key}=.*|${key}=${escaped}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

# Push every KEY=VALUE from env_file into a running Swarm service.
swarm_apply_env_file() {
  local service="$1"
  local env_file="$2"
  shift 2

  if [[ ! -f "$env_file" ]]; then
    echo "swarm_apply_env_file: missing $env_file" >&2
    return 1
  fi

  local update_args=("$@")
  local line key val

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    key="${line%%=*}"
    val="${line#*=}"
    [[ -z "$key" ]] && continue
    update_args+=(--env-rm "$key" --env-add "${key}=${val}")
  done < "$env_file"

  if ((${#update_args[@]} == 0)); then
    echo "swarm_apply_env_file: no keys in $env_file" >&2
    return 1
  fi

  docker service update "${update_args[@]}" "$service"
}

swarm_running_task_ids_for_service() {
  local service="$1"
  if [[ -z "$service" ]]; then
    return 0
  fi

  local ids
  ids="$(docker ps -q \
    --filter "label=com.docker.swarm.service.name=${service}" \
    --filter 'status=running' 2>/dev/null || true)"
  if [[ -n "$ids" ]]; then
    printf '%s\n' $ids
    return 0
  fi

  # Legacy Dokploy tasks may omit the Swarm label; fall back to name prefix.
  docker ps -q --filter "name=${service}" --filter 'status=running' 2>/dev/null || true
}
