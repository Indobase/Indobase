#!/usr/bin/env bash
# Full Adral → Indobase staging bootstrap (no Google OAuth).
set -euo pipefail

ADRAL_REPO="${ADRAL_REPO:-/Users/roshanraghavander/Desktop/Adral/adrall/adral}"
IND_REPO="${IND_REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"
REF="${PROJECT_REF:-adralproject-uspulzkzew}"
export PROJECT_REF="$REF"
export ADRAL_REPO INDO_REPO

echo "==> 1/6 Prepare + import edge functions"
(cd "$ADRAL_REPO" && npm run supabase:prepare)
bash "$IND_REPO/docker/scripts/import-edge-functions-from-repo.sh"

echo "==> 2/6 Push edge secrets"
bash "$ADRAL_REPO/scripts/push-indobase-secrets-vps.sh"

echo "==> 3/6 Auth config (email, no Google)"
bash "$IND_REPO/docker/scripts/adral-apply-auth-config-vps.sh"
bash "$IND_REPO/docker/scripts/adral-apply-resend-smtp-vps.sh"

echo "==> 4/6 Cron job (postgres DB)"
bash "$IND_REPO/docker/scripts/adral-register-schedule-cron-vps.sh"

echo "==> 5/6 Staging web app"
bash "$IND_REPO/docker/scripts/deploy-adral-staging-vps.sh"

echo "==> 6/6 Smoke"
scp -4 -o ConnectTimeout=30 -i "${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_indobase_vps}" \
  "$IND_REPO/docker/scripts/adral-indobase-smoke.sh" \
  "${VPS_SSH:-root@187.77.30.165}:/tmp/"
ssh -4 -o ConnectTimeout=30 -i "${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_indobase_vps}" \
  "${VPS_SSH:-root@187.77.30.165}" \
  "TENANT_COMPOSE=/var/lib/docker/volumes/indobase-backend-bmqhan_tenants-data/_data/${REF}/docker-compose.yml bash /tmp/adral-indobase-smoke.sh"

echo ""
echo "Staging: https://adral-staging.indobase.in"
echo "API:     https://${REF}.indobase.in"
