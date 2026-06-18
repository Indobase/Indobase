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
SHA="${IMAGE_TAG:-$(git -C "$REPO_ROOT" rev-parse HEAD)}"
IMAGE="${BUILDER_IMAGE:-roshanraghavander/indobase-builder:${SHA}}"
SSH_HOST="${VPS_SSH:-root@187.77.30.165}"
SSH_KEY="${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_indobase_vps}"
SSH_OPTS=(-4 -o ConnectTimeout=45 -i "$SSH_KEY")
SERVICE_NAME="${BUILDER_SERVICE_NAME:-indobase-builder}"
BUILDER_URL="${BUILDER_APP_URL:-https://builder.indobase.in}"
STUDIO_FILTER="${INDOBASE_STUDIO_NAME_FILTER:-indobase-studio}"

echo "==> Deploy Builder image ${IMAGE} to ${SSH_HOST}…"

ssh "${SSH_OPTS[@]}" "$SSH_HOST" bash -s <<REMOTE
set -euo pipefail
SERVICE_NAME="${SERVICE_NAME}"
IMAGE="${IMAGE}"
BUILDER_URL="${BUILDER_URL}"
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
  echo "Created \${ENV_FILE} — add BUILDER_HANDOFF_SECRET and LLM keys if missing."
fi

if docker service inspect "\${SERVICE_NAME}" >/dev/null 2>&1; then
  echo "Updating swarm service \${SERVICE_NAME}…"
  docker service update --image "\${IMAGE}" "\${SERVICE_NAME}"
else
  echo "Creating swarm service \${SERVICE_NAME}…"
  docker service create \
    --name "\${SERVICE_NAME}" \
    --network dokploy-network \
    --env-file "\${ENV_FILE}" \
    --limit-memory 2g \
    --no-healthcheck \
    "\${IMAGE}"
fi

TRAEFIK_FILE="/etc/dokploy/traefik/dynamic/builder-indobase.yml"
if [[ ! -f "\${TRAEFIK_FILE}" ]]; then
  echo "Traefik route missing at \${TRAEFIK_FILE} — copy docker/traefik/builder-indobase.yml from the repo."
else
  echo "Traefik route present: \${TRAEFIK_FILE}"
fi

STUDIO_SVC="\$(docker service ls --format '{{.Name}}' | grep -E "\${STUDIO_FILTER}" | head -1 || true)"
if [[ -n "\${STUDIO_SVC}" ]]; then
  echo "Pointing Studio (\${STUDIO_SVC}) BUILDER_APP_URL to \${BUILDER_URL}…"
  docker service update \
    --env-add "BUILDER_APP_URL=\${BUILDER_URL}" \
    --env-add "NEXT_PUBLIC_BUILDER_APP_URL=\${BUILDER_URL}" \
    "\${STUDIO_SVC}" || true
fi

echo "Health check (local)…"
sleep 5
curl -fsS "http://127.0.0.1:5173/api/health" | head -c 200 || echo "warn: local health check failed (service may still be starting)"
REMOTE

echo "==> Public health check…"
for attempt in $(seq 1 12); do
  http_code="$(curl -sS -o /tmp/builder-health.json -w '%{http_code}' --max-time 10 "${BUILDER_URL}/api/health" 2>/dev/null || echo 000)"
  if [[ "$http_code" == "200" ]]; then
    echo "✅ Builder healthy at ${BUILDER_URL}/api/health (attempt ${attempt})"
    head -c 200 /tmp/builder-health.json || true
    echo ""
    exit 0
  fi
  echo "attempt ${attempt}: http=${http_code}"
  sleep 10
done

echo "::warning::Builder not healthy at ${BUILDER_URL} yet — check swarm logs and Traefik route."
exit 1
