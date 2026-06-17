#!/usr/bin/env bash
# Production Auth (GoTrue) for Adral on Indobase — site URL adral.ai, email autoconfirm optional.
set -euo pipefail

REF="${PROJECT_REF:-adralproject-uspulzkzew}"
SSH_HOST="${VPS_SSH:-root@187.77.30.165}"
SSH_KEY="${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_indobase_vps}"
SSH_OPTS=(-4 -o ConnectTimeout=45 -i "$SSH_KEY")
PROD_HOST="${PROD_HOST:-adral.ai}"
TENANT_DIR="${TENANT_DIR:-/var/lib/docker/volumes/indobase-backend-bmqhan_tenants-data/_data/${REF}}"
COMPOSE="${TENANT_COMPOSE:-${TENANT_DIR}/docker-compose.yml}"

ALLOW_LIST="https://adral.ai,https://adral.ai/**,https://www.adral.ai,https://www.adral.ai/**,https://staging.adral.ai,https://staging.adral.ai/**,https://adral-staging.indobase.in,https://adral-staging.indobase.in/**,https://${REF}.indobase.in,https://${REF}.indobase.in/**,http://localhost:5173,http://localhost:5173/**,http://127.0.0.1:5173,http://127.0.0.1:5173/**"

ssh "${SSH_OPTS[@]}" "$SSH_HOST" "ALLOW_LIST='$ALLOW_LIST' PROD_HOST='$PROD_HOST' COMPOSE='$COMPOSE' REF='$REF' python3 <<'PY'
import os, re
path = os.environ['COMPOSE']
text = open(path).read()
replacements = {
    'GOTRUE_SITE_URL': 'https://' + os.environ['PROD_HOST'],
    'GOTRUE_URI_ALLOW_LIST': os.environ['ALLOW_LIST'],
    'API_EXTERNAL_URL': 'https://' + os.environ['PROD_HOST'],
    'GOTRUE_EXTERNAL_GOOGLE_ENABLED': 'true',
    'GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI': 'https://' + os.environ['PROD_HOST'] + '/auth/v1/callback',
    'GOTRUE_DISABLE_SIGNUP': 'false',
    'GOTRUE_MAILER_AUTOCONFIRM': 'false',
}
for key, val in replacements.items():
    pat = rf\"({key}:\\s*)(['\\\"][^'\\\"]*['\\\"]|\\\"[^\\\"]*\\\"|[^\\n]+)\"
    if re.search(pat, text):
        text = re.sub(pat, lambda m, k=key, v=val: f\"{m.group(1)}'{v}'\", text, count=1)
open(path, 'w').write(text)
print('patched', path)
PY
cd \"${TENANT_DIR}\" && docker compose up -d tenant-auth"
echo "Auth updated: GOTRUE_SITE_URL=https://${PROD_HOST}"
