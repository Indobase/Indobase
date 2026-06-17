#!/usr/bin/env bash
# Point Adral tenant GoTrue at production Resend SMTP (from VPS smtp.env / control-plane .env).
# Does NOT enable mailer autoconfirm — users must confirm via email.
set -euo pipefail

REF="${PROJECT_REF:-adralproject-uspulzkzew}"
SSH_HOST="${VPS_SSH:-root@187.77.30.165}"
SSH_KEY="${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_indobase_vps}"
SSH_OPTS=(-4 -o ConnectTimeout=45 -i "$SSH_KEY")
TENANT_DIR="${TENANT_DIR:-/var/lib/docker/volumes/indobase-backend-bmqhan_tenants-data/_data/${REF}}"
# Adral-branded From (verified in Resend); override with ADRAL_SMTP_ADMIN_EMAIL if needed.
ADRAL_SMTP_ADMIN_EMAIL="${ADRAL_SMTP_ADMIN_EMAIL:-hello@adral.ai}"
ADRAL_SMTP_SENDER_NAME="${ADRAL_SMTP_SENDER_NAME:-Adral}"

ssh "${SSH_OPTS[@]}" "$SSH_HOST" "REF='$REF' TENANT_DIR='$TENANT_DIR' ADRAL_FROM='$ADRAL_SMTP_ADMIN_EMAIL' ADRAL_SENDER='$ADRAL_SMTP_SENDER_NAME' bash -s" <<'REMOTE'
set -euo pipefail
COMPOSE="$TENANT_DIR/docker-compose.yml"
ENV_CP="/etc/dokploy/compose/indobase-backend-bmqhan/code/docker/.env"
SECRETS="/etc/indobase/smtp.env"

read_env_kv() {
  local key="$1" file="$2"
  grep -m1 "^${key}=" "$file" 2>/dev/null | cut -d= -f2- | tr -d '\r' || true
}
[[ -f "$SECRETS" ]] && set -a && source "$SECRETS" && set +a
if [[ -f "$ENV_CP" ]]; then
  for k in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS RESEND_API_KEY; do
    v="$(read_env_kv "$k" "$ENV_CP")"
    [[ -n "$v" ]] && export "$k=$v"
  done
fi

if [[ -n "${RESEND_API_KEY:-}" && -z "${SMTP_PASS:-}" ]]; then
  SMTP_HOST="${SMTP_HOST:-smtp.resend.com}"
  SMTP_PORT="${SMTP_PORT:-587}"
  SMTP_USER="${SMTP_USER:-resend}"
  SMTP_PASS="$RESEND_API_KEY"
fi

if [[ -z "${SMTP_PASS:-}" || "${SMTP_PASS}" == "fake_mail_password" ]]; then
  echo "Missing Resend/SMTP credentials. Set /etc/indobase/smtp.env or control-plane .env" >&2
  exit 1
fi

SMTP_HOST="${SMTP_HOST:-smtp.resend.com}"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_USER="${SMTP_USER:-resend}"

export COMPOSE SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS ADRAL_FROM ADRAL_SENDER
python3 <<PY
import os, re

def yaml_quote(v):
    v = str(v).replace("\\\\", "\\\\\\\\").replace('"', '\\\\"')
    return f'"{v}"' if v else '""'

path = os.environ["COMPOSE"]
text = open(path).read()
repl = {
    r"GOTRUE_MAILER_AUTOCONFIRM:.*": 'GOTRUE_MAILER_AUTOCONFIRM: "false"',
    r"GOTRUE_SMTP_HOST:.*": f'GOTRUE_SMTP_HOST: {yaml_quote(os.environ["SMTP_HOST"])}',
    r"GOTRUE_SMTP_PORT:.*": f'GOTRUE_SMTP_PORT: {yaml_quote(os.environ["SMTP_PORT"])}',
    r"GOTRUE_SMTP_USER:.*": f'GOTRUE_SMTP_USER: {yaml_quote(os.environ["SMTP_USER"])}',
    r"GOTRUE_SMTP_PASS:.*": f'GOTRUE_SMTP_PASS: {yaml_quote(os.environ["SMTP_PASS"])}',
    r"GOTRUE_SMTP_ADMIN_EMAIL:.*": f'GOTRUE_SMTP_ADMIN_EMAIL: {yaml_quote(os.environ["ADRAL_FROM"])}',
    r"GOTRUE_SMTP_SENDER_NAME:.*": f'GOTRUE_SMTP_SENDER_NAME: {yaml_quote(os.environ["ADRAL_SENDER"])}',
}
for pat, sub in repl.items():
    if re.search(pat, text):
        text = re.sub(pat, sub, text, count=1)
open(path, "w").write(text)
print("patched SMTP + MAILER_AUTOCONFIRM=false", path)
PY

cd "$TENANT_DIR" && docker compose up -d tenant-auth
docker inspect "indobase-tenant-${REF}-tenant-auth-1" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
  | grep -E 'GOTRUE_SMTP_HOST|GOTRUE_MAILER_AUTOCONFIRM|GOTRUE_SMTP_ADMIN' || true
REMOTE

echo "Adral tenant auth: Resend SMTP, autoconfirm off."
