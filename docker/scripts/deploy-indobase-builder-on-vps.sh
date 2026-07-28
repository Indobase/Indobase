#!/usr/bin/env bash
# Deploy Indobase Builder (AI app builder) on the VPS Swarm + Traefik.
#
# Usage:
#   IMAGE_TAG=<git-sha> ./docker/scripts/deploy-indobase-builder-on-vps.sh
#
# Defaults IMAGE_TAG to current HEAD. Updates Studio BUILDER_APP_URL when a Studio
# swarm service is found.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SHA="${IMAGE_TAG:-$(git -C "$REPO_ROOT" rev-parse HEAD)}"
IMAGE="${BUILDER_IMAGE:-roshanraghavander/indobase-builder:${SHA}}"
SSH_HOST="${VPS_SSH:-root@103.190.92.249}"
SSH_KEY="${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_indobase_vps}"
SSH_OPTS=(-4 -o ConnectTimeout=45 -i "$SSH_KEY")
SERVICE_NAME="${BUILDER_SERVICE_NAME:-indobase-builder}"
BUILDER_URL="${BUILDER_APP_URL:-https://builder.indobase.in}"
STUDIO_PUBLIC_URL="${INDOBASE_STUDIO_URL:-https://studio.indobase.in}"
STUDIO_FILTER="${INDOBASE_STUDIO_NAME_FILTER:-indobase-studio}"

echo "==> Deploy Builder image ${IMAGE} to ${SSH_HOST}…"

ssh "${SSH_OPTS[@]}" "$SSH_HOST" "mkdir -p /opt/indobase/lib"
scp "${SSH_OPTS[@]}" \
  "${SCRIPT_DIR}/lib/swarm-managed-env.sh" \
  "${SSH_HOST}:/opt/indobase/lib/swarm-managed-env.sh"

ssh "${SSH_OPTS[@]}" "$SSH_HOST" "cat > /etc/dokploy/traefik/dynamic/builder-indobase.yml" < "${REPO_ROOT}/docker/traefik/builder-indobase.yml"
echo "Synced Traefik route: /etc/dokploy/traefik/dynamic/builder-indobase.yml"

ssh "${SSH_OPTS[@]}" "$SSH_HOST" bash -s <<REMOTE
set -euo pipefail
# shellcheck source=/opt/indobase/lib/swarm-managed-env.sh
source /opt/indobase/lib/swarm-managed-env.sh

SERVICE_NAME="${SERVICE_NAME}"
IMAGE="${IMAGE}"
BUILDER_URL="${BUILDER_URL}"
STUDIO_PUBLIC_URL="${STUDIO_PUBLIC_URL}"
STUDIO_FILTER="${STUDIO_FILTER}"

echo "Pulling \${IMAGE}…"
docker pull "\${IMAGE}"

ENV_FILE="/opt/indobase-builder.runtime.env"
if [[ ! -f "\${ENV_FILE}" ]]; then
  cat > "\${ENV_FILE}" <<EOF
NODE_ENV=production
HOST=0.0.0.0
PORT=5173
EOF
  echo "Created \${ENV_FILE} — add BUILDER_HANDOFF_SECRET and LLM keys before serving traffic."
fi

STUDIO_SVC="\$(swarm_discover_service "\${STUDIO_FILTER}")"
STUDIO_INTERNAL_URL="\${STUDIO_INTERNAL_URL:-}"
if [[ -z "\${STUDIO_INTERNAL_URL}" && -n "\${STUDIO_SVC}" ]]; then
  # Swarm DNS on dokploy-network; Studio listens on 8080 inside the container.
  STUDIO_INTERNAL_URL="http://\${STUDIO_SVC}:8080"
fi

if [[ -n "\${STUDIO_INTERNAL_URL}" ]]; then
  swarm_upsert_env_file_kv "\${ENV_FILE}" STUDIO_INTERNAL_URL "\${STUDIO_INTERNAL_URL}"
  echo "Studio internal fetch base: \${STUDIO_INTERNAL_URL}"
fi

if [[ -n "\${STUDIO_PUBLIC_URL}" ]]; then
  swarm_upsert_env_file_kv "\${ENV_FILE}" INDOBASE_STUDIO_URL "\${STUDIO_PUBLIC_URL}"
  swarm_upsert_env_file_kv "\${ENV_FILE}" NEXT_PUBLIC_INDOBASE_STUDIO_URL "\${STUDIO_PUBLIC_URL}"
  swarm_upsert_env_file_kv "\${ENV_FILE}" VITE_INDOBASE_STUDIO_URL "\${STUDIO_PUBLIC_URL}"
fi

if ! grep -q '^BUILDER_HANDOFF_SECRET=.\{32,\}' "\${ENV_FILE}" 2>/dev/null; then
  echo "::error::\${ENV_FILE} is missing BUILDER_HANDOFF_SECRET (min 32 chars). Builder will refuse to start in production."
  exit 1
fi

if grep -q '^BUILDER_ALLOW_UNAUTHENTICATED=true' "\${ENV_FILE}" 2>/dev/null; then
  echo "::error::BUILDER_ALLOW_UNAUTHENTICATED must not be enabled in production."
  exit 1
fi

if docker service inspect "\${SERVICE_NAME}" >/dev/null 2>&1; then
  echo "Updating swarm service \${SERVICE_NAME} (image + managed env)…"
  if ! grep -q '^NODE_OPTIONS=' "\${ENV_FILE}" 2>/dev/null; then
    swarm_upsert_env_file_kv "\${ENV_FILE}" NODE_OPTIONS '--dns-result-order=ipv4first'
  fi
  swarm_apply_env_file "\${SERVICE_NAME}" "\${ENV_FILE}" \
    --image "\${IMAGE}" \
    --dns-add 8.8.8.8 \
    --dns-add 8.8.4.4 \
    --dns-add 1.1.1.1
else
  echo "Creating swarm service \${SERVICE_NAME}…"
  if ! grep -q '^NODE_OPTIONS=' "\${ENV_FILE}" 2>/dev/null; then
    printf '\nNODE_OPTIONS=--dns-result-order=ipv4first\n' >> "\${ENV_FILE}"
  fi
  docker service create \
    --name "\${SERVICE_NAME}" \
    --network dokploy-network \
    --dns 8.8.8.8 \
    --dns 8.8.4.4 \
    --dns 1.1.1.1 \
    --env-file "\${ENV_FILE}" \
    --limit-memory 2g \
    "\${IMAGE}"
fi

TRAEFIK_FILE="/etc/dokploy/traefik/dynamic/builder-indobase.yml"
if [[ ! -f "\${TRAEFIK_FILE}" ]]; then
  echo "Traefik route missing at \${TRAEFIK_FILE} — copy docker/traefik/builder-indobase.yml from the repo."
else
  echo "Traefik route present: \${TRAEFIK_FILE}"
fi

if [[ -n "\${STUDIO_SVC}" ]]; then
  echo "Pointing Studio (\${STUDIO_SVC}) BUILDER_APP_URL to \${BUILDER_URL}…"
  docker service update \
    --env-add "BUILDER_APP_URL=\${BUILDER_URL}" \
    --env-add "NEXT_PUBLIC_BUILDER_APP_URL=\${BUILDER_URL}" \
    "\${STUDIO_SVC}" || true
fi

echo "Waiting for service to settle…"
sleep 8
REMOTE

echo "==> Public health checks…"
# shellcheck source=lib/deploy-health-gates.sh
source "${SCRIPT_DIR}/lib/deploy-health-gates.sh"
if deploy_wait_for_builder_rollout "$BUILDER_URL" "$SHA" 18; then
  head -c 200 /tmp/builder-health-live.json 2>/dev/null || true
  echo ""
  exit 0
fi

echo "::warning::Builder not ready at ${BUILDER_URL}/api/health/ready yet — check swarm logs, runtime env, and Traefik route."
exit 1
