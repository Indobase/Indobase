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
SSH_HOST="${VPS_SSH:-root@103.190.92.249}"
SSH_KEY="${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_indobase_vps}"
SSH_OPTS=(-4 -o ConnectTimeout=45 -i "$SSH_KEY")
SERVICE_NAME="${BUILDER_SERVICE_NAME:-indobase-builder}"
BUILDER_URL="${BUILDER_APP_URL:-https://builder.indobase.in}"
STUDIO_FILTER="${INDOBASE_STUDIO_NAME_FILTER:-indobase-studio}"

echo "==> Deploy Builder image ${IMAGE} to ${SSH_HOST}…"

ssh "${SSH_OPTS[@]}" "$SSH_HOST" "cat > /etc/dokploy/traefik/dynamic/builder-indobase.yml" < "${REPO_ROOT}/docker/traefik/builder-indobase.yml"
echo "Synced Traefik route: /etc/dokploy/traefik/dynamic/builder-indobase.yml"

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
  echo "Created \${ENV_FILE} — add BUILDER_HANDOFF_SECRET and LLM keys before serving traffic."
fi

STUDIO_SVC="\$(docker service ls --format '{{.Name}}' | grep -E "\${STUDIO_FILTER}" | head -1 || true)"
STUDIO_INTERNAL_URL="\${STUDIO_INTERNAL_URL:-}"
if [[ -z "\${STUDIO_INTERNAL_URL}" && -n "\${STUDIO_SVC}" ]]; then
  # Swarm DNS on dokploy-network; Studio listens on 8080 inside the container.
  STUDIO_INTERNAL_URL="http://\${STUDIO_SVC}:8080"
fi

if [[ -n "\${STUDIO_INTERNAL_URL}" ]]; then
  if grep -q '^STUDIO_INTERNAL_URL=' "\${ENV_FILE}" 2>/dev/null; then
    sed -i "s|^STUDIO_INTERNAL_URL=.*|STUDIO_INTERNAL_URL=\${STUDIO_INTERNAL_URL}|" "\${ENV_FILE}"
  else
    printf '\nSTUDIO_INTERNAL_URL=%s\n' "\${STUDIO_INTERNAL_URL}" >> "\${ENV_FILE}"
  fi
  echo "Studio internal fetch base: \${STUDIO_INTERNAL_URL}"
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
  echo "Updating swarm service \${SERVICE_NAME}…"
  UPDATE_ARGS=(
    --image "\${IMAGE}"
    --dns-add 8.8.8.8
    --dns-add 8.8.4.4
    --dns-add 1.1.1.1
    --env-add "NODE_OPTIONS=--dns-result-order=ipv4first"
  )
  if [[ -n "\${STUDIO_INTERNAL_URL}" ]]; then
    UPDATE_ARGS+=(--env-add "STUDIO_INTERNAL_URL=\${STUDIO_INTERNAL_URL}")
  fi
  docker service update "\${UPDATE_ARGS[@]}" "\${SERVICE_NAME}"
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
for attempt in $(seq 1 18); do
  live_code="$(curl -sS -o /tmp/builder-health-live.json -w '%{http_code}' --max-time 10 "${BUILDER_URL}/api/health/live" 2>/dev/null || echo 000)"
  if [[ "$live_code" == "200" ]]; then
    live_version="$(python3 -c "import json; print(json.load(open('/tmp/builder-health-live.json')).get('version',''))" 2>/dev/null || true)"
    if [[ -n "$live_version" && "$live_version" != "unknown" && "$live_version" != "${SHA}" ]]; then
      echo "attempt ${attempt}: live ok but version=${live_version} expected ${SHA}"
    else
      echo "✅ Builder live at ${BUILDER_URL}/api/health/live (version=${live_version:-${SHA}}, attempt ${attempt})"
      head -c 200 /tmp/builder-health-live.json || true
      echo ""
      exit 0
    fi
  fi
  echo "attempt ${attempt}: live http=${live_code}"
  sleep 10
done

echo "::warning::Builder not healthy at ${BUILDER_URL}/api/health/live yet — check swarm logs and Traefik route."
exit 1
