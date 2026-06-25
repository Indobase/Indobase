#!/usr/bin/env bash
# Build and deploy Adral web staging against Indobase tenant (no OAuth changes).
#
# Usage (Mac, from ind-repo):
#   ADRAL_REPO=/path/to/adral ./docker/scripts/deploy-adral-staging-vps.sh
#
# Hostname: https://adral-staging.indobase.in (add DNS A → VPS if needed)
set -euo pipefail

ADRAL_REPO="${ADRAL_REPO:-/Users/roshanraghavander/Desktop/Adral/adrall/adral}"
REF="${PROJECT_REF:-adralproject-uspulzkzew}"
SSH_HOST="${VPS_SSH:-root@187.77.30.165}"
SSH_KEY="${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_indobase_vps}"
SSH_OPTS=(-4 -o ConnectTimeout=45 -i "$SSH_KEY")
STAGING_HOST="${STAGING_HOST:-adral-staging.indobase.in}"
REMOTE_DIR="/opt/adral-staging-build"
SERVICE_NAME="adral-staging"
IMAGE="adral-staging:latest"
TENANT_COMPOSE="/var/lib/docker/volumes/indobase-backend-bmqhan_tenants-data/_data/${REF}/docker-compose.yml"
VPS_IP="${VPS_IP:-187.77.30.165}"

[[ -d "$ADRAL_REPO" ]] || { echo "ADRAL_REPO not found: $ADRAL_REPO"; exit 1; }

echo "==> Sync Adral sources to VPS (excluding node_modules, dist, .git)…"
tar -C "$ADRAL_REPO" \
  --exclude node_modules --exclude dist --exclude .git \
  -czf - . | ssh "${SSH_OPTS[@]}" "$SSH_HOST" "mkdir -p '$REMOTE_DIR' && tar -xzf - -C '$REMOTE_DIR'"

echo "==> Resolve Indobase anon key from tenant compose…"
ssh "${SSH_OPTS[@]}" "$SSH_HOST" "python3 <<'PY'
import re
text = open('${TENANT_COMPOSE}').read()
url = 'https://${REF}.indobase.in'
anon = re.search(r\"SUPABASE_ANON_KEY:\\s*'([^']+)'\", text)
if not anon:
    raise SystemExit('SUPABASE_ANON_KEY not in tenant compose')
staging = 'https://${STAGING_HOST}'
open('/opt/adral-staging.runtime.env', 'w').write(
    f'VITE_BACKEND_URL={staging}\\n'
    f'VITE_BACKEND_ANON_KEY={anon.group(1)}\\n'
    f'VITE_BACKEND_PROJECT_REF=${REF}\\n'
    f'VITE_SUPABASE_URL={staging}\\n'
    f'VITE_SUPABASE_ANON_KEY={anon.group(1)}\\n'
    f'INDOBASE_TENANT_UPSTREAM_HOST=${REF}.indobase.in\\n'
    f'INDOBASE_TENANT_UPSTREAM_IP=${VPS_IP}\\n'
)
print('wrote /opt/adral-staging.runtime.env')
PY"

echo "==> Docker build (may take several minutes)…"
ssh "${SSH_OPTS[@]}" "$SSH_HOST" "cd '$REMOTE_DIR' && docker build -t '$IMAGE' \
  --build-arg VITE_BACKEND_URL=https://${STAGING_HOST} \
  --build-arg VITE_BACKEND_ANON_KEY=\$(grep SUPABASE_ANON_KEY '$TENANT_COMPOSE' | head -1 | sed \"s/.*'\\([^']*\\)'.*/\\1/\") \
  --build-arg VITE_SUPABASE_URL=https://${STAGING_HOST} \
  . 2>&1 | tail -20"

echo "==> Deploy Swarm service ${SERVICE_NAME}…"
ssh "${SSH_OPTS[@]}" "$SSH_HOST" bash -s <<REMOTE
set -euo pipefail
if docker service inspect ${SERVICE_NAME} >/dev/null 2>&1; then
  docker service rm ${SERVICE_NAME} || true
  sleep 3
fi
docker service create \
  --name ${SERVICE_NAME} \
  --network dokploy-network \
  --env-file /opt/adral-staging.runtime.env \
  --limit-memory 512m \
  ${IMAGE}
REMOTE

echo "==> Traefik route for ${STAGING_HOST}…"
ssh "${SSH_OPTS[@]}" "$SSH_HOST" "cat > /etc/dokploy/traefik/dynamic/${SERVICE_NAME}.yml" <<YAML
http:
  routers:
    ${SERVICE_NAME}-http:
      rule: Host(\`${STAGING_HOST}\`)
      service: ${SERVICE_NAME}-svc
      middlewares:
        - redirect-to-https
      entryPoints:
        - web
    ${SERVICE_NAME}-https:
      rule: Host(\`${STAGING_HOST}\`)
      service: ${SERVICE_NAME}-svc
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
  services:
    ${SERVICE_NAME}-svc:
      loadBalancer:
        servers:
          - url: http://${SERVICE_NAME}:80
        passHostHeader: true
YAML

echo "==> Add auth redirect for ${STAGING_HOST} (if missing)…"
ssh "${SSH_OPTS[@]}" "$SSH_HOST" "STAGING_HOST='${STAGING_HOST}' REF='${REF}' TENANT_COMPOSE='${TENANT_COMPOSE}' python3 <<'PY'
import os, re
path = os.environ['TENANT_COMPOSE']
host = 'https://' + os.environ['STAGING_HOST']
text = open(path).read()
if host in text:
    print('redirect already present')
else:
    m = re.search(r\"GOTRUE_URI_ALLOW_LIST:\\s*'([^']*)'\", text)
    if not m:
        raise SystemExit('GOTRUE_URI_ALLOW_LIST not found')
    extra = f\",{host},{host}/**\" if not m.group(1).endswith(',') else f\"{host},{host}/**\"
    new_list = m.group(1) + extra
    text = text[: m.start(1)] + new_list + text[m.end(1) :]
    open(path, 'w').write(text)
    print('patched allow list')
PY
cd /var/lib/docker/volumes/indobase-backend-bmqhan_tenants-data/_data/${REF} && docker compose up -d tenant-auth"

echo ""
echo "Staging URL: https://${STAGING_HOST}"
echo "Verify: curl -sS https://${STAGING_HOST}/config.js | head -3"
