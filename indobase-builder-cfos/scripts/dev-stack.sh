#!/usr/bin/env bash
# Start Cloudflare OS (upstream) + Indobase Builder CFOS bridge together.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CFOS_DIR="${CLOUDFLARE_OS_DIR:-$ROOT/upstream/cloudflare-os}"
BRIDGE_DIR="$ROOT/bridge"
CFOS_PORT="${CLOUDFLARE_OS_PORT:-8787}"
BRIDGE_PORT="${PORT:-${BUILDER_CFOS_PORT:-8791}}"
SECRET="${BUILDER_CFOS_HANDOFF_SECRET:-${BUILDER_HANDOFF_SECRET:-}}"

if [[ ${#SECRET} -lt 32 ]]; then
  SECRET="$(openssl rand -hex 24)"
  echo "Generated BUILDER_CFOS_HANDOFF_SECRET=$SECRET"
fi

if [[ ! -d "$CFOS_DIR/.git" ]]; then
  echo "Fetching Cloudflare OS…"
  bash "$ROOT/scripts/fetch-cloudflare-os.sh"
fi

export BUILDER_CFOS_HANDOFF_SECRET="$SECRET"
export CLOUDFLARE_OS_URL="http://127.0.0.1:${CFOS_PORT}"
export PORT="$BRIDGE_PORT"

PIDS=()
cleanup() {
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

echo "→ Cloudflare OS on :${CFOS_PORT}"
(
  cd "$CFOS_DIR"
  if [[ ! -d node_modules ]]; then
    pnpm install
  fi
  # run-local binds 8787 by default
  pnpm run-local
) &
PIDS+=($!)

echo "Waiting for Cloudflare OS…"
for i in $(seq 1 90); do
  if curl -sf -o /dev/null "http://127.0.0.1:${CFOS_PORT}/" 2>/dev/null \
    || curl -sf -o /dev/null "http://127.0.0.1:${CFOS_PORT}" 2>/dev/null; then
    echo "Cloudflare OS is up."
    break
  fi
  if [[ "$i" -eq 90 ]]; then
    echo "Timed out waiting for Cloudflare OS on :${CFOS_PORT}"
    exit 1
  fi
  sleep 2
done

echo "→ Bridge on :${BRIDGE_PORT} (CLOUDFLARE_OS_URL=$CLOUDFLARE_OS_URL)"
(
  cd "$BRIDGE_DIR"
  if [[ ! -d node_modules ]]; then
    pnpm install --ignore-workspace
  fi
  pnpm exec tsx src/index.ts
) &
PIDS+=($!)

sleep 1
curl -sS "http://127.0.0.1:${BRIDGE_PORT}/sso/health" || true
echo
echo "Mint a local handoff:"
echo "  BUILDER_CFOS_HANDOFF_SECRET='$SECRET' BUILDER_CFOS_APP_URL='http://127.0.0.1:${BRIDGE_PORT}' bash $ROOT/scripts/mint-local-handoff.sh"
echo
wait
