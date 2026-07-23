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

upsert_env() {
  local file="$1" key="$2" value="$3"
  touch "$file"
  chmod 600 "$file"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    # Escape sed replacement specials in value
    local escaped
    escaped=$(printf '%s' "$value" | sed -e 's/[\\/&]/\\&/g')
    sed -i "s|^${key}=.*|${key}=${escaped}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

# Builder: upsert required keys; preserve OPEN_ROUTER_API_KEY and other secrets.
upsert_env /opt/indobase-staging/env/builder.env NODE_ENV production
upsert_env /opt/indobase-staging/env/builder.env HOST 0.0.0.0
upsert_env /opt/indobase-staging/env/builder.env PORT 5173
upsert_env /opt/indobase-staging/env/builder.env BUILDER_HANDOFF_SECRET "$HANDOFF"
upsert_env /opt/indobase-staging/env/builder.env STUDIO_INTERNAL_URL "$STUDIO_URL"
upsert_env /opt/indobase-staging/env/builder.env INDOBASE_STUDIO_URL "$STUDIO_URL"
upsert_env /opt/indobase-staging/env/builder.env NODE_OPTIONS '--dns-result-order=ipv4first'

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

upsert_env /opt/indobase-staging/env/studio.env BUILDER_HANDOFF_SECRET "$HANDOFF"
upsert_env /opt/indobase-staging/env/studio.env BUILDER_APP_URL "$BUILDER_URL"
upsert_env /opt/indobase-staging/env/studio.env NEXT_PUBLIC_BUILDER_APP_URL "$BUILDER_URL"
upsert_env /opt/indobase-staging/env/studio.env SITE_URL "$STUDIO_URL"
upsert_env /opt/indobase-staging/env/studio.env NEXT_PUBLIC_SITE_URL "$STUDIO_URL"
upsert_env /opt/indobase-staging/env/studio.env SUPABASE_URL "$API_URL"

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
  docker service update --image "${STUDIO_IMAGE}" --limit-memory 1100m "${STUDIO_SVC}"
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
  docker service update --image "${BUILDER_IMAGE}" --limit-memory 1100m \
    --env-add "STUDIO_INTERNAL_URL=${STUDIO_URL}" \
    --env-add "INDOBASE_STUDIO_URL=${STUDIO_URL}" \
    "${BUILDER_SVC}"
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
sleep 8
curl -fsS "${STUDIO_URL}/api/health/live" | head -c 400 || echo "(studio not ready yet — check DNS/TLS)"
echo
curl -fsS "${BUILDER_URL}/api/health/live" | head -c 400 || curl -fsS "${BUILDER_URL}/api/health" | head -c 400 || echo "(builder not ready yet)"
echo
echo "==> Staging deploy finished for ${SHA}"
