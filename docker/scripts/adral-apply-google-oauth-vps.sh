#!/usr/bin/env bash
# Enable Google OAuth on Adral Indobase tenant (GoTrue).
#
# Usage (do not commit secrets):
#   GOOGLE_CLIENT_ID='....apps.googleusercontent.com' \
#   GOOGLE_CLIENT_SECRET='GOCSPX-...' \
#   ./docker/scripts/adral-apply-google-oauth-vps.sh
set -euo pipefail

REF="${PROJECT_REF:-adralproject-uspulzkzew}"
SSH_HOST="${VPS_SSH:-root@187.77.30.165}"
SSH_KEY="${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_indobase_vps}"
SSH_OPTS=(-4 -o ConnectTimeout=45 -i "$SSH_KEY")
TENANT_DIR="${TENANT_DIR:-/var/lib/docker/volumes/indobase-backend-bmqhan_tenants-data/_data/${REF}}"
PROD_HOST="${PROD_HOST:-adral.ai}"
CALLBACK="${OAUTH_CALLBACK:-https://${PROD_HOST}/auth/v1/callback}"

: "${GOOGLE_CLIENT_ID:?Set GOOGLE_CLIENT_ID}"
: "${GOOGLE_CLIENT_SECRET:?Set GOOGLE_CLIENT_SECRET}"

ssh "${SSH_OPTS[@]}" "$SSH_HOST" "REF='$REF' TENANT_DIR='$TENANT_DIR' CALLBACK='$CALLBACK' bash -s" <<REMOTE
set -euo pipefail
export GOOGLE_CLIENT_ID='${GOOGLE_CLIENT_ID}'
export GOOGLE_CLIENT_SECRET='${GOOGLE_CLIENT_SECRET}'
export COMPOSE="\$TENANT_DIR/docker-compose.yml"
export CALLBACK

python3 <<PY
import os, re

path = os.environ["COMPOSE"]
text = open(path).read()
vals = {
    "GOTRUE_EXTERNAL_GOOGLE_ENABLED": "true",
    "GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID": os.environ["GOOGLE_CLIENT_ID"],
    "GOTRUE_EXTERNAL_GOOGLE_SECRET": os.environ["GOOGLE_CLIENT_SECRET"],
    "GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI": os.environ["CALLBACK"],
}
for key, val in vals.items():
    pat = key + r":\\s*[^\\n]+"
    if re.search(pat, text):
        text = re.sub(pat, key + ": '" + val.replace("'", "''") + "'", text, count=1)
    else:
        text = text.replace(
            "      GOTRUE_EXTERNAL_GOOGLE_ENABLED:",
            "      " + key + ": '" + val.replace("'", "''") + "'\\n      GOTRUE_EXTERNAL_GOOGLE_ENABLED:",
            1,
        )
open(path, "w").write(text)
print("patched Google OAuth on", path)
PY

cd "\$TENANT_DIR" && docker compose up -d tenant-auth
sleep 2
curl -sS "https://\${REF}.indobase.in/auth/v1/settings" | python3 -c "import sys,json; d=json.load(sys.stdin); g=d.get('external',{}).get('google',{}); print('google enabled:', g)"
REMOTE

echo "Google OAuth enabled for ${REF}"
