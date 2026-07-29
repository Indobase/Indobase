#!/usr/bin/env bash
# Ensure Frappe persist volumes are writable by uid 1000 (frappe/bench image).
# Run on the compose host before first boot / after recreating empty volumes.
set -euo pipefail

VOLUMES=(
  indobase-discuss_discuss_bench_sites
  indobase-workspace_suite_bench_sites
  indobase-crm_crm_bench_sites
  indobase-helpdesk_helpdesk_bench_sites
)

for v in "${VOLUMES[@]}"; do
  if docker volume inspect "$v" >/dev/null 2>&1; then
    echo "chown 1000:1000 on volume $v"
    docker run --rm -v "${v}:/v" alpine chown -R 1000:1000 /v
  else
    echo "skip missing volume $v"
  fi
done
