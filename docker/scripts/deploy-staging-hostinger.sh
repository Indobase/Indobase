#!/usr/bin/env bash
# Deploy Studio + Builder staging on Hostinger (indobase.fun).
#
# Prerequisites:
#   - SSH as root to STAGING_HOST with key access
#   - DNS: studio.indobase.fun + builder.indobase.fun → this VPS
#   - Docker Hub images already published for IMAGE_TAG
#
# Usage:
#   IMAGE_TAG=<git-sha> ./docker/scripts/deploy-staging-hostinger.sh
#   STAGING_SSH=root@72.61.242.251 IMAGE_TAG=... ./docker/scripts/deploy-staging-hostinger.sh
#
# This Hostinger box already runs Dokploy Traefik on :80/:443 — do NOT install Caddy.
# Services join dokploy-network; routes live in /etc/dokploy/traefik/dynamic/*-indobase-fun.yml
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SHA="${IMAGE_TAG:-$(git -C "$REPO_ROOT" rev-parse HEAD)}"
STUDIO_IMAGE="${STUDIO_IMAGE:-roshanraghavander/ind-repo:${SHA}}"
BUILDER_IMAGE="${BUILDER_IMAGE:-roshanraghavander/indobase-builder:${SHA}}"
SSH_HOST="${STAGING_SSH:-root@72.61.242.251}"
SSH_KEY="${STAGING_SSH_KEY:-${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_indobase_vps}}"
SSH_OPTS=(-4 -o ConnectTimeout=45 -i "$SSH_KEY")
STUDIO_URL="${STAGING_STUDIO_URL:-https://studio.indobase.fun}"
BUILDER_URL="${STAGING_BUILDER_URL:-https://builder.indobase.fun}"
API_URL="${STAGING_API_URL:-https://api.indobase.in}"
STUDIO_SVC="${STAGING_STUDIO_SERVICE:-indobase-studio-staging}"
BUILDER_SVC="${STAGING_BUILDER_SERVICE:-indobase-builder-staging}"

echo "==> Staging deploy ${SHA}"
echo "    Studio:  ${STUDIO_IMAGE} @ ${STUDIO_URL}"
echo "    Builder: ${BUILDER_IMAGE} @ ${BUILDER_URL}"
echo "    API:     ${API_URL} (shared prod)"
echo "    Host:    ${SSH_HOST} (srv1085730)"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ssh "${SSH_OPTS[@]}" "$SSH_HOST" "mkdir -p /opt/indobase-staging/lib"
scp "${SSH_OPTS[@]}" \
  "${SCRIPT_DIR}/lib/swarm-managed-env.sh" \
  "${SSH_HOST}:/opt/indobase-staging/lib/swarm-managed-env.sh"

ssh "${SSH_OPTS[@]}" "$SSH_HOST" \
  env \
  STUDIO_IMAGE="$STUDIO_IMAGE" \
  BUILDER_IMAGE="$BUILDER_IMAGE" \
  STUDIO_URL="$STUDIO_URL" \
  BUILDER_URL="$BUILDER_URL" \
  API_URL="$API_URL" \
  STUDIO_SVC="$STUDIO_SVC" \
  BUILDER_SVC="$BUILDER_SVC" \
  bash -s <<'REMOTE'
set -euo pipefail

mkdir -p /opt/indobase-staging/env

if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if [[ ! -f /opt/indobase-staging/env/handoff.secret ]]; then
  openssl rand -hex 32 > /opt/indobase-staging/env/handoff.secret
  chmod 600 /opt/indobase-staging/env/handoff.secret
fi
HANDOFF="$(cat /opt/indobase-staging/env/handoff.secret)"

# shellcheck source=/opt/indobase-staging/lib/swarm-managed-env.sh
source /opt/indobase-staging/lib/swarm-managed-env.sh

STUDIO_INTERNAL_URL="http://${STUDIO_SVC}:8080"

# Builder: upsert required keys; preserve OPEN_ROUTER_API_KEY and other secrets.
swarm_upsert_env_file_kv /opt/indobase-staging/env/builder.env NODE_ENV production
swarm_upsert_env_file_kv /opt/indobase-staging/env/builder.env HOST 0.0.0.0
swarm_upsert_env_file_kv /opt/indobase-staging/env/builder.env PORT 5173
swarm_upsert_env_file_kv /opt/indobase-staging/env/builder.env BUILDER_HANDOFF_SECRET "$HANDOFF"
swarm_upsert_env_file_kv /opt/indobase-staging/env/builder.env STUDIO_INTERNAL_URL "$STUDIO_INTERNAL_URL"
swarm_upsert_env_file_kv /opt/indobase-staging/env/builder.env INDOBASE_STUDIO_URL "$STUDIO_URL"
swarm_upsert_env_file_kv /opt/indobase-staging/env/builder.env NODE_OPTIONS '--dns-result-order=ipv4first'
if [[ -n "${WEBCONTAINER_API_KEY:-}" ]]; then
  swarm_upsert_env_file_kv /opt/indobase-staging/env/builder.env WEBCONTAINER_API_KEY "$WEBCONTAINER_API_KEY"
fi

# Studio: create skeleton once, then always upsert public URLs + handoff.
if [[ ! -f /opt/indobase-staging/env/studio.env ]]; then
  cat > /opt/indobase-staging/env/studio.env <<EOF
HOSTNAME=0.0.0.0
PORT=8080
NODE_ENV=production
# Fill Postgres/meta/JWT when tunnel to Vyom .249 is ready for full /api/platform.
EOF
  chmod 600 /opt/indobase-staging/env/studio.env
fi

swarm_upsert_env_file_kv /opt/indobase-staging/env/studio.env BUILDER_HANDOFF_SECRET "$HANDOFF"
swarm_upsert_env_file_kv /opt/indobase-staging/env/studio.env BUILDER_APP_URL "$BUILDER_URL"
swarm_upsert_env_file_kv /opt/indobase-staging/env/studio.env NEXT_PUBLIC_BUILDER_APP_URL "$BUILDER_URL"
swarm_upsert_env_file_kv /opt/indobase-staging/env/studio.env SITE_URL "$STUDIO_URL"
swarm_upsert_env_file_kv /opt/indobase-staging/env/studio.env NEXT_PUBLIC_SITE_URL "$STUDIO_URL"
swarm_upsert_env_file_kv /opt/indobase-staging/env/studio.env SUPABASE_URL "$API_URL"
swarm_upsert_env_file_kv /opt/indobase-staging/env/studio.env INDOBASE_ANALYTICS_URL "https://analytics.indobase.fun"
swarm_upsert_env_file_kv /opt/indobase-staging/env/studio.env NEXT_PUBLIC_INDOBASE_ANALYTICS_URL "https://analytics.indobase.fun"
swarm_upsert_env_file_kv /opt/indobase-staging/env/studio.env ANALYTICS_HANDOFF_SECRET "$HANDOFF"
# Indobase Design (Canva-class, indobase-design-v2) on Vyom .249.
# Prefer design.indobase.fun; studio-design.indobase.fun remains a Traefik alias.
# DESIGN_HANDOFF_SECRET must match the design stack on .249 (same as prod Studio).
# If /opt/indobase-staging/env/design.handoff.secret exists, use it; else shared HANDOFF.
DESIGN_HANDOFF="$HANDOFF"
if [ -f /opt/indobase-staging/env/design.handoff.secret ]; then
  DESIGN_HANDOFF=$(tr -d '[:space:]' </opt/indobase-staging/env/design.handoff.secret)
fi
swarm_upsert_env_file_kv /opt/indobase-staging/env/studio.env INDOBASE_DESIGN_URL "https://design.indobase.fun"
swarm_upsert_env_file_kv /opt/indobase-staging/env/studio.env NEXT_PUBLIC_INDOBASE_DESIGN_URL "https://design.indobase.fun"
swarm_upsert_env_file_kv /opt/indobase-staging/env/studio.env DESIGN_HANDOFF_SECRET "$DESIGN_HANDOFF"

# Quoted heredocs so Traefik Host(`…`) backticks are not executed by the local shell.
cat > /etc/dokploy/traefik/dynamic/studio-indobase-fun.yml <<EOF
http:
  routers:
    studio-fun-http:
      rule: Host(\`studio.indobase.fun\`)
      service: studio-fun-svc
      middlewares:
        - redirect-to-https
      entryPoints:
        - web
    studio-fun-https:
      rule: Host(\`studio.indobase.fun\`)
      service: studio-fun-svc
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
  services:
    studio-fun-svc:
      loadBalancer:
        servers:
          - url: http://${STUDIO_SVC}:8080
        passHostHeader: true
EOF

cat > /etc/dokploy/traefik/dynamic/builder-indobase-fun.yml <<EOF
http:
  serversTransports:
    builder-fun-long:
      forwardingTimeouts:
        dialTimeout: 30s
        responseHeaderTimeout: 0s
        idleConnTimeout: 3600s
  routers:
    builder-fun-http:
      rule: Host(\`builder.indobase.fun\`)
      service: builder-fun-svc
      middlewares:
        - redirect-to-https
      entryPoints:
        - web
    builder-fun-https:
      rule: Host(\`builder.indobase.fun\`)
      service: builder-fun-svc
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
  services:
    builder-fun-svc:
      loadBalancer:
        serversTransport: builder-fun-long
        responseForwarding:
          flushInterval: 1ms
        servers:
          - url: http://${BUILDER_SVC}:5173
        passHostHeader: true
EOF

echo "Pulling ${STUDIO_IMAGE} and ${BUILDER_IMAGE}…"
docker pull "${STUDIO_IMAGE}"
docker pull "${BUILDER_IMAGE}"

if docker service inspect "${STUDIO_SVC}" >/dev/null 2>&1; then
  echo "Updating ${STUDIO_SVC} (image + managed env)…"
  swarm_apply_env_file "${STUDIO_SVC}" /opt/indobase-staging/env/studio.env \
    --image "${STUDIO_IMAGE}" --limit-memory 1100m
else
  docker service create \
    --name "${STUDIO_SVC}" \
    --network dokploy-network \
    --replicas 1 \
    --limit-memory 1100m \
    --reserve-memory 512m \
    --env-file /opt/indobase-staging/env/studio.env \
    --dns 8.8.8.8 --dns 8.8.4.4 \
    "${STUDIO_IMAGE}"
fi

if docker service inspect "${BUILDER_SVC}" >/dev/null 2>&1; then
  echo "Updating ${BUILDER_SVC} (image + managed env)…"
  swarm_apply_env_file "${BUILDER_SVC}" /opt/indobase-staging/env/builder.env \
    --image "${BUILDER_IMAGE}" --limit-memory 1100m
else
  docker service create \
    --name "${BUILDER_SVC}" \
    --network dokploy-network \
    --replicas 1 \
    --limit-memory 1100m \
    --reserve-memory 512m \
    --env-file /opt/indobase-staging/env/builder.env \
    --dns 8.8.8.8 --dns 8.8.4.4 \
    "${BUILDER_IMAGE}"
fi

docker service ls | grep indobase || true
echo "Handoff secret: /opt/indobase-staging/env/handoff.secret"
REMOTE

echo "==> Verifying public endpoints…"
# shellcheck source=lib/deploy-health-gates.sh
source "${SCRIPT_DIR}/lib/deploy-health-gates.sh"
sleep 8
deploy_wait_for_studio_rollout "$STUDIO_URL" "$SHA" 12 || echo "(studio not ready yet — check DNS/TLS/meta env)"
deploy_wait_for_builder_rollout "$BUILDER_URL" "$SHA" 12 || echo "(builder not ready yet — check OPEN_ROUTER_API_KEY / handoff secret)"
echo "==> Staging deploy finished for ${SHA}"
