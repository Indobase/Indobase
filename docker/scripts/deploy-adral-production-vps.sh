#!/usr/bin/env bash
# Build and deploy Adral production web on Indobase VPS (same tenant as staging).
#
# Usage:
#   ADRAL_REPO=/path/to/adral ./docker/scripts/deploy-adral-production-vps.sh
#
# After deploy: point adral.ai (+ www) DNS A record → 187.77.30.165 (studio.indobase.in host).
set -euo pipefail

ADRAL_REPO="${ADRAL_REPO:-/Users/roshanraghavander/Desktop/Adral/adrall/adral}"
REF="${PROJECT_REF:-adralproject-uspulzkzew}"
SSH_HOST="${VPS_SSH:-root@187.77.30.165}"
SSH_KEY="${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_indobase_vps}"
SSH_OPTS=(-4 -o ConnectTimeout=45 -i "$SSH_KEY")
PROD_HOST="${PROD_HOST:-adral.ai}"
WWW_HOST="${WWW_HOST:-www.adral.ai}"
REMOTE_DIR="/opt/adral-production-build"
SERVICE_NAME="adral-production"
IMAGE="adral-production:latest"
TENANT_COMPOSE="/var/lib/docker/volumes/indobase-backend-bmqhan_tenants-data/_data/${REF}/docker-compose.yml"
VPS_IP="${VPS_IP:-187.77.30.165}"

[[ -d "$ADRAL_REPO" ]] || { echo "ADRAL_REPO not found: $ADRAL_REPO"; exit 1; }

echo "==> Sync Adral sources to VPS…"
tar -C "$ADRAL_REPO" \
  --exclude node_modules --exclude dist --exclude .git \
  -czf - . | ssh "${SSH_OPTS[@]}" "$SSH_HOST" "mkdir -p '$REMOTE_DIR' && tar -xzf - -C '$REMOTE_DIR'"

echo "==> Runtime env (same-origin API proxy to tenant)…"
ssh "${SSH_OPTS[@]}" "$SSH_HOST" "python3 <<'PY'
import re
text = open('${TENANT_COMPOSE}').read()
anon = re.search(r\"SUPABASE_ANON_KEY:\\s*'([^']+)'\", text)
if not anon:
    raise SystemExit('SUPABASE_ANON_KEY not in tenant compose')
prod = 'https://${PROD_HOST}'
open('/opt/adral-production.runtime.env', 'w').write(
    f'VITE_BACKEND_URL={prod}\\n'
    f'VITE_BACKEND_ANON_KEY={anon.group(1)}\\n'
    f'VITE_BACKEND_PROJECT_REF=${REF}\\n'
    f'VITE_SUPABASE_URL={prod}\\n'
    f'VITE_SUPABASE_ANON_KEY={anon.group(1)}\\n'
    f'INDOBASE_TENANT_UPSTREAM_HOST=${REF}.indobase.in\\n'
    f'INDOBASE_TENANT_UPSTREAM_IP=${VPS_IP}\\n'
)
print('wrote /opt/adral-production.runtime.env')
PY"

echo "==> Docker build…"
ssh "${SSH_OPTS[@]}" "$SSH_HOST" "cd '$REMOTE_DIR' && docker build -t '$IMAGE' \
  --build-arg CACHEBUST=\$(date +%s) \
  --build-arg VITE_BACKEND_URL=https://${PROD_HOST} \
  --build-arg VITE_BACKEND_ANON_KEY=\$(grep SUPABASE_ANON_KEY '$TENANT_COMPOSE' | head -1 | sed \"s/.*'\\([^']*\\)'.*/\\1/\") \
  --build-arg VITE_SUPABASE_URL=https://${PROD_HOST} \
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
  --env-file /opt/adral-production.runtime.env \
  --limit-memory 512m \
  ${IMAGE}
REMOTE

echo "==> Traefik routes for ${PROD_HOST} and ${WWW_HOST}…"
ssh "${SSH_OPTS[@]}" "$SSH_HOST" "cat > /etc/dokploy/traefik/dynamic/${SERVICE_NAME}.yml" <<YAML
http:
  routers:
    ${SERVICE_NAME}-http:
      rule: Host(\`${PROD_HOST}\`) || Host(\`${WWW_HOST}\`)
      service: ${SERVICE_NAME}-svc
      middlewares:
        - redirect-to-https
      entryPoints:
        - web
    ${SERVICE_NAME}-https:
      rule: Host(\`${PROD_HOST}\`) || Host(\`${WWW_HOST}\`)
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

echo "==> Auth: production site URL + redirect allow list…"
PROD_HOST="$PROD_HOST" REF="$REF" TENANT_COMPOSE="$TENANT_COMPOSE" \
  bash "$(dirname "$0")/adral-apply-production-auth-vps.sh"

echo "==> Auth: Resend SMTP (confirm email required)…"
bash "$(dirname "$0")/adral-apply-resend-smtp-vps.sh"

echo ""
echo "Production deployed on VPS ${VPS_IP}."
echo "  Pre-DNS test: curl -sk --resolve ${PROD_HOST}:443:${VPS_IP} https://${PROD_HOST}/config.js | head -3"
echo ""
echo "DNS cutover (required):"
echo "  ${PROD_HOST}  A  → ${VPS_IP}"
echo "  ${WWW_HOST}   A  → ${VPS_IP}  (or CNAME to ${PROD_HOST})"
echo ""
echo "Also update Razorpay webhook to:"
echo "  https://${PROD_HOST}/functions/v1/razorpay-webhook"
