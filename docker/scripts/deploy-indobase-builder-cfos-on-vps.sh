#!/usr/bin/env bash
# Deploy Builder Gen 3 CFOS SSO bridge on Vyom control-plane Swarm (.249).
#
# Usage:
#   IMAGE_TAG=<git-sha> ./docker/scripts/deploy-indobase-builder-cfos-on-vps.sh
#
# Builds/pushes image as roshanraghavander/indobase-builder-cfos:<sha> if missing.
# Syncs Traefik + Studio BUILDER_CFOS_APP_URL.
# Set REPLACE_CLASSIC_BUILDER=1 to make CFOS the default Open Builder target and
# scale classic indobase-builder to 0 (requires CLOUDFLARE_OS_URL on the CFOS service).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SHA="${IMAGE_TAG:-$(git -C "$REPO_ROOT" rev-parse HEAD)}"
IMAGE="${BUILDER_CFOS_IMAGE:-roshanraghavander/indobase-builder-cfos:${SHA}}"
SSH_HOST="${VPS_SSH:-root@103.190.92.249}"
SSH_KEY="${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_indobase_vps}"
SSH_OPTS=(-4 -o ConnectTimeout=45 -i "$SSH_KEY")
SERVICE_NAME="${BUILDER_CFOS_SERVICE_NAME:-indobase-builder-cfos}"
# CFOS is the only Builder at builder.indobase.in (builder-v2 hostname retired).
CFOS_URL="${BUILDER_CFOS_APP_URL:-https://builder.indobase.in}"
STUDIO_FILTER="${INDOBASE_STUDIO_NAME_FILTER:-indobase-studio}"
BUILD_LOCALLY="${BUILD_CFOS_IMAGE:-1}"
REPLACE_CLASSIC="${REPLACE_CLASSIC_BUILDER:-0}"
CLOUDFLARE_OS_URL_VALUE="${CLOUDFLARE_OS_URL:-}"
# Default internal runtime URL on Vyom .249 (docker_gwbridge → host :8787)
if [[ -z "$CLOUDFLARE_OS_URL_VALUE" && "$REPLACE_CLASSIC" == "1" ]]; then
  CLOUDFLARE_OS_URL_VALUE="http://172.18.0.1:8787"
fi

echo "==> Deploy Builder CFOS bridge ${IMAGE} to ${SSH_HOST}…"

if [[ "$BUILD_LOCALLY" == "1" ]]; then
  if ! curl -fsI "https://hub.docker.com/v2/repositories/roshanraghavander/indobase-builder-cfos/tags/${SHA}/" >/dev/null 2>&1; then
    echo "Building and pushing ${IMAGE} (not on Hub yet)…"
    docker build \
      -f "${REPO_ROOT}/indobase-builder-cfos/Dockerfile" \
      --build-arg "GIT_SHA=${SHA}" \
      -t "${IMAGE}" \
      "${REPO_ROOT}"
    docker push "${IMAGE}"
  else
    echo "Hub already has tag ${SHA}"
  fi
fi

ssh "${SSH_OPTS[@]}" "$SSH_HOST" "mkdir -p /opt/indobase/lib /opt/indobase-builder-cfos"
scp "${SSH_OPTS[@]}" \
  "${SCRIPT_DIR}/lib/swarm-managed-env.sh" \
  "${SSH_HOST}:/opt/indobase/lib/swarm-managed-env.sh"

ssh "${SSH_OPTS[@]}" "$SSH_HOST" "cat > /etc/dokploy/traefik/dynamic/builder-indobase.yml" \
  < "${REPO_ROOT}/docker/traefik/builder-indobase.yml"
# Retire duplicate hostname (same CFOS backend).
ssh "${SSH_OPTS[@]}" "$SSH_HOST" "rm -f /etc/dokploy/traefik/dynamic/builder-v2-indobase.yml"
echo "Synced Traefik route: /etc/dokploy/traefik/dynamic/builder-indobase.yml (builder-v2 removed)"

# Static Launch: sites.indobase.in + *.sites.indobase.in → CFOS bridge
# (DNS A sites / *.sites → .249; do NOT touch tenant * → .248)
ssh "${SSH_OPTS[@]}" "$SSH_HOST" "mkdir -p /etc/dokploy/traefik/dynamic/certificates /etc/dokploy/traefik/dynamic/sites-custom /var/lib/indobase/launches"
ssh "${SSH_OPTS[@]}" "$SSH_HOST" "cat > /etc/dokploy/traefik/dynamic/sites-indobase.yml" \
  < "${REPO_ROOT}/docker/traefik/sites-indobase.yml"
echo "Synced Traefik route: /etc/dokploy/traefik/dynamic/sites-indobase.yml"

# Wildcard TLS file pointer (certs themselves stay on VPS; do not overwrite)
if [[ -f "${REPO_ROOT}/docker/traefik/sites-wildcard-tls.yml" ]]; then
  ssh "${SSH_OPTS[@]}" "$SSH_HOST" "cat > /etc/dokploy/traefik/dynamic/sites-wildcard-tls.yml" \
    < "${REPO_ROOT}/docker/traefik/sites-wildcard-tls.yml"
  echo "Synced Traefik TLS: /etc/dokploy/traefik/dynamic/sites-wildcard-tls.yml"
fi

ssh "${SSH_OPTS[@]}" "$SSH_HOST" bash -s <<REMOTE
set -euo pipefail
source /opt/indobase/lib/swarm-managed-env.sh

SERVICE_NAME="${SERVICE_NAME}"
IMAGE="${IMAGE}"
CFOS_URL="${CFOS_URL}"
STUDIO_FILTER="${STUDIO_FILTER}"
SHA="${SHA}"
REPLACE_CLASSIC="${REPLACE_CLASSIC}"
CLOUDFLARE_OS_URL_VALUE="${CLOUDFLARE_OS_URL_VALUE}"

if docker image inspect "\${IMAGE}" >/dev/null 2>&1; then
  echo "Using local image \${IMAGE} (skip registry pull)"
else
  echo "Pulling \${IMAGE}…"
  docker pull "\${IMAGE}"
fi

ENV_FILE="/opt/indobase-builder-cfos.runtime.env"
STUDIO_ENV="/opt/indobase/studio-swarm.env"
DOCKER_ENV="/opt/indobase/docker/.env"
LAUNCH_ROOT="/var/lib/indobase/launches"
TRAEFIK_CUSTOM_HOST="/etc/dokploy/traefik/dynamic/sites-custom"
TRAEFIK_CUSTOM_CONTAINER="/var/lib/indobase/traefik-dynamic"

SECRET=""
if [[ -f "\${ENV_FILE}" ]]; then
  SECRET="\$(grep -E '^BUILDER_CFOS_HANDOFF_SECRET=' "\${ENV_FILE}" 2>/dev/null | head -1 | cut -d= -f2- || true)"
fi
if [[ \${#SECRET} -lt 32 && -f "\${STUDIO_ENV}" ]]; then
  SECRET="\$(grep -E '^BUILDER_CFOS_HANDOFF_SECRET=' "\${STUDIO_ENV}" 2>/dev/null | head -1 | cut -d= -f2- || true)"
fi
if [[ \${#SECRET} -lt 32 && -f "\${STUDIO_ENV}" ]]; then
  SECRET="\$(grep -E '^BUILDER_HANDOFF_SECRET=' "\${STUDIO_ENV}" 2>/dev/null | head -1 | cut -d= -f2- || true)"
fi
if [[ \${#SECRET} -lt 32 && -f "\${DOCKER_ENV}" ]]; then
  SECRET="\$(grep -E '^BUILDER_HANDOFF_SECRET=' "\${DOCKER_ENV}" 2>/dev/null | head -1 | cut -d= -f2- || true)"
fi
if [[ \${#SECRET} -lt 32 ]]; then
  echo "::error::Could not find BUILDER_HANDOFF_SECRET / BUILDER_CFOS_HANDOFF_SECRET (>=32) on VPS"
  exit 1
fi

if [[ ! -f "\${ENV_FILE}" ]]; then
  cat > "\${ENV_FILE}" <<EOF
NODE_ENV=production
HOST=0.0.0.0
PORT=8791
EOF
fi

swarm_upsert_env_file_kv "\${ENV_FILE}" NODE_ENV "production"
swarm_upsert_env_file_kv "\${ENV_FILE}" HOST "0.0.0.0"
swarm_upsert_env_file_kv "\${ENV_FILE}" PORT "8791"
swarm_upsert_env_file_kv "\${ENV_FILE}" GIT_SHA "\${SHA}"
swarm_upsert_env_file_kv "\${ENV_FILE}" BUILDER_CFOS_VERSION "\${SHA}"
swarm_upsert_env_file_kv "\${ENV_FILE}" BUILDER_CFOS_HANDOFF_SECRET "\${SECRET}"
# Platform API (OTP / ensure / publish) — Studio Swarm DNS on dokploy-network
STUDIO_SVC="\$(swarm_discover_service "\${STUDIO_FILTER}" || true)"
PLATFORM_API=""
if [[ -n "\${STUDIO_SVC}" ]]; then
  PLATFORM_API="http://\${STUDIO_SVC}:8080"
fi
if [[ -n "\${PLATFORM_API}" ]]; then
  swarm_upsert_env_file_kv "\${ENV_FILE}" PLATFORM_API_URL "\${PLATFORM_API}"
  swarm_upsert_env_file_kv "\${ENV_FILE}" STUDIO_INTERNAL_URL "\${PLATFORM_API}"
  echo "Platform API base: \${PLATFORM_API}"
fi
# Static Launch hosts (sites.indobase.in / *.sites.indobase.in) — keep in sync with Traefik
swarm_upsert_env_file_kv "\${ENV_FILE}" INDOBASE_LAUNCH_DOMAIN_SUFFIX "sites.indobase.in"
swarm_upsert_env_file_kv "\${ENV_FILE}" INDOBASE_LAUNCH_CNAME_TARGET "sites.indobase.in"
swarm_upsert_env_file_kv "\${ENV_FILE}" INDOBASE_LAUNCH_PUBLIC_URL "https://sites.indobase.in"
swarm_upsert_env_file_kv "\${ENV_FILE}" INDOBASE_LAUNCH_ROOT "\${LAUNCH_ROOT}"
# Ecommerce functional verify pack (GUEST_CHECKOUT_OK, FAKE_PRICE_IGNORED, …) burns
# catalog stock on Go Live — leave INDOBASE_ECOMMERCE_FUNCTIONAL_VERIFY unset/off on
# prod by default. To enable on the CFOS Swarm service only when ops intentionally wants it:
#   swarm_upsert_env_file_kv "\${ENV_FILE}" INDOBASE_ECOMMERCE_FUNCTIONAL_VERIFY "1"
# then re-apply managed env / service update. Do not force-enable in this script.
swarm_upsert_env_file_kv "\${ENV_FILE}" INDOBASE_LAUNCH_USE_PATH_URL "0"
swarm_upsert_env_file_kv "\${ENV_FILE}" INDOBASE_LAUNCH_TRAEFIK_DYNAMIC_DIR "\${TRAEFIK_CUSTOM_CONTAINER}"
if [[ -n "\${CLOUDFLARE_OS_URL_VALUE}" ]]; then
  swarm_upsert_env_file_kv "\${ENV_FILE}" CLOUDFLARE_OS_URL "\${CLOUDFLARE_OS_URL_VALUE}"
fi

# Sentry — Indobase OS / Gen 3 CFOS bridge (project: builder-cfos)
SENTRY_DSN_VALUE="\${SENTRY_DSN:-}"
if [[ -z "\${SENTRY_DSN_VALUE}" && -f "\${ENV_FILE}" ]]; then
  SENTRY_DSN_VALUE="\$(grep -E '^SENTRY_DSN=' "\${ENV_FILE}" 2>/dev/null | head -1 | cut -d= -f2- || true)"
fi
if [[ -z "\${SENTRY_DSN_VALUE}" && -f "\${STUDIO_ENV}" ]]; then
  SENTRY_DSN_VALUE="\$(grep -E '^SENTRY_DSN_BUILDER_CFOS=' "\${STUDIO_ENV}" 2>/dev/null | head -1 | cut -d= -f2- || true)"
fi
if [[ -n "\${SENTRY_DSN_VALUE}" ]]; then
  swarm_upsert_env_file_kv "\${ENV_FILE}" SENTRY_DSN "\${SENTRY_DSN_VALUE}"
  swarm_upsert_env_file_kv "\${ENV_FILE}" SENTRY_ENVIRONMENT "\${SENTRY_ENVIRONMENT:-production}"
  echo "Sentry DSN configured for \${SERVICE_NAME}"
else
  echo "::warning::SENTRY_DSN not set for builder-cfos — errors will not report to Sentry"
fi

if [[ -f "\${STUDIO_ENV}" ]]; then
  swarm_upsert_env_file_kv "\${STUDIO_ENV}" BUILDER_CFOS_APP_URL "\${CFOS_URL}"
  swarm_upsert_env_file_kv "\${STUDIO_ENV}" BUILDER_CFOS_HANDOFF_SECRET "\${SECRET}"
  if [[ "\${REPLACE_CLASSIC}" == "1" ]]; then
    swarm_upsert_env_file_kv "\${STUDIO_ENV}" BUILDER_USE_CFOS "1"
  elif grep -q '^BUILDER_USE_CFOS=' "\${STUDIO_ENV}" 2>/dev/null; then
    sed -i '/^BUILDER_USE_CFOS=/d' "\${STUDIO_ENV}" || true
  fi
fi

ensure_bind_mount() {
  local service="\$1" source="\$2" target="\$3"
  local mounts
  mounts="\$(docker service inspect "\$service" --format '{{json .Spec.TaskTemplate.ContainerSpec.Mounts}}' 2>/dev/null || echo 'null')"
  if echo "\$mounts" | grep -q "\"Target\":\"\${target}\""; then
    echo "Bind mount \${target} already present"
    return 0
  fi
  echo "Adding bind mount \${source} → \${target}"
  docker service update --mount-add "type=bind,source=\${source},destination=\${target}" "\$service" >/dev/null
}

if docker service inspect "\${SERVICE_NAME}" >/dev/null 2>&1; then
  echo "Updating swarm service \${SERVICE_NAME} (image + managed env)…"
  swarm_apply_env_file "\${SERVICE_NAME}" "\${ENV_FILE}" --image "\${IMAGE}"
  docker service update --host-add "host.docker.internal:host-gateway" "\${SERVICE_NAME}" >/dev/null || true
  ensure_bind_mount "\${SERVICE_NAME}" "\${LAUNCH_ROOT}" "\${LAUNCH_ROOT}"
  ensure_bind_mount "\${SERVICE_NAME}" "\${TRAEFIK_CUSTOM_HOST}" "\${TRAEFIK_CUSTOM_CONTAINER}"
else
  echo "Creating swarm service \${SERVICE_NAME}…"
  docker service create \
    --name "\${SERVICE_NAME}" \
    --network dokploy-network \
    --env-file "\${ENV_FILE}" \
    --limit-memory 512m \
    --host-add "host.docker.internal:host-gateway" \
    --mount "type=bind,source=\${LAUNCH_ROOT},destination=\${LAUNCH_ROOT}" \
    --mount "type=bind,source=\${TRAEFIK_CUSTOM_HOST},destination=\${TRAEFIK_CUSTOM_CONTAINER}" \
    "\${IMAGE}"
fi

if [[ "\${REPLACE_CLASSIC}" == "1" ]]; then
  if [[ -z "\${CLOUDFLARE_OS_URL_VALUE}" ]] && ! grep -q '^CLOUDFLARE_OS_URL=.' "\${ENV_FILE}" 2>/dev/null; then
    echo "::error::REPLACE_CLASSIC_BUILDER=1 requires CLOUDFLARE_OS_URL (e.g. http://host.docker.internal:8787)"
    exit 1
  fi
fi

STUDIO_SVC="\$(swarm_discover_service "\${STUDIO_FILTER}")"
if [[ -n "\${STUDIO_SVC}" && -f "\${STUDIO_ENV}" ]]; then
  echo "Pointing Studio (\${STUDIO_SVC}) BUILDER_CFOS_APP_URL to \${CFOS_URL}…"
  if [[ "\${REPLACE_CLASSIC}" == "1" ]]; then
    docker service update \
      --env-add "BUILDER_CFOS_APP_URL=\${CFOS_URL}" \
      --env-add "BUILDER_CFOS_HANDOFF_SECRET=\${SECRET}" \
      --env-add "BUILDER_USE_CFOS=1" \
      "\${STUDIO_SVC}" || true
    if docker service inspect indobase-builder >/dev/null 2>&1; then
      echo "Scaling classic indobase-builder → 0 (CFOS is default)…"
      docker service scale indobase-builder=0 || true
    fi
  else
    docker service update \
      --env-add "BUILDER_CFOS_APP_URL=\${CFOS_URL}" \
      --env-add "BUILDER_CFOS_HANDOFF_SECRET=\${SECRET}" \
      --env-rm "BUILDER_USE_CFOS" \
      "\${STUDIO_SVC}" || true
  fi
fi

echo "Waiting for service to settle…"
sleep 8
docker service ps "\${SERVICE_NAME}" --no-trunc | head -8
echo "Done. Smoke: curl -sS \${CFOS_URL}/sso/health"
REMOTE

echo "==> Public health checks…"
for i in 1 2 3 4 5 6 7 8; do
  if out=$(curl -fsS "${CFOS_URL}/sso/health" 2>/dev/null); then
    echo "$out"
    exit 0
  fi
  echo "health not ready yet (attempt ${i})…"
  sleep 8
done
echo "::warning::CFOS bridge not ready at ${CFOS_URL}/sso/health yet — check DNS (.249), Traefik, swarm logs."
exit 1
