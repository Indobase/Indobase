#!/usr/bin/env bash
# Apply production SMTP (Resend or any SMTP) to control-plane auth, Studio, and all tenant stacks.
#
# Usage (on VPS):
#   export RESEND_API_KEY=re_xxxx   # or set SMTP_PASS / SMTP_HOST in /etc/indobase/smtp.env
#   bash docker/scripts/configure-production-smtp-on-vps.sh
#
# Optional env:
#   SMTP_HOST=smtp.resend.com SMTP_PORT=587 SMTP_USER=resend
#   SMTP_ADMIN_EMAIL=auth@indobase.in SMTP_SENDER_NAME=Indobase
#   ENABLE_EMAIL_AUTOCONFIRM=false
#   DOCKER_DIR=/etc/dokploy/compose/indobase-backend-bmqhan/code/docker
set -euo pipefail

DOCKER_DIR="${DOCKER_DIR:-/etc/dokploy/compose/indobase-backend-bmqhan/code/docker}"
SECRETS_FILE="${INDOBASE_SMTP_SECRETS:-/etc/indobase/smtp.env}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-indobase-backend-bmqhan}"
STUDIO_FILTER="${INDOBASE_STUDIO_NAME_FILTER:-indobase-studio}"

if [[ -f "$SECRETS_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$SECRETS_FILE"
  set +a
fi

if [[ -n "${RESEND_API_KEY:-}" && -z "${SMTP_PASS:-}" ]]; then
  export SMTP_HOST="${SMTP_HOST:-smtp.resend.com}"
  export SMTP_PORT="${SMTP_PORT:-587}"
  export SMTP_USER="${SMTP_USER:-resend}"
  export SMTP_PASS="$RESEND_API_KEY"
fi

if [[ -z "${SMTP_PASS:-}" || "${SMTP_PASS}" == "fake_mail_password" ]]; then
  echo "No production SMTP credentials." >&2
  echo "Create $SECRETS_FILE with:" >&2
  echo '  RESEND_API_KEY=re_xxxxxxxx' >&2
  echo "or SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_ADMIN_EMAIL" >&2
  exit 1
fi

export SMTP_HOST="${SMTP_HOST:-smtp.resend.com}"
export SMTP_PORT="${SMTP_PORT:-587}"
export SMTP_USER="${SMTP_USER:-resend}"
export SMTP_ADMIN_EMAIL="${SMTP_ADMIN_EMAIL:-auth@indobase.in}"
export SMTP_SENDER_NAME="${SMTP_SENDER_NAME:-Indobase}"
export ENABLE_EMAIL_AUTOCONFIRM="${ENABLE_EMAIL_AUTOCONFIRM:-false}"
# Dual-VPS: tenant GoTrue on the data-plane host cannot use Docker DNS names.
CONTROL_PLANE_HOST="${SAAS_CONTROL_PLANE_HOST:-${SAAS_SMTP_PUBLIC_HOST:-}}"
if [[ -z "$CONTROL_PLANE_HOST" && -f /etc/indobase/smtp.env ]]; then
  # shellcheck disable=SC1091
  CONTROL_PLANE_HOST="$(grep -m1 '^SAAS_CONTROL_PLANE_HOST=' /etc/indobase/smtp.env 2>/dev/null | cut -d= -f2- || true)"
fi
if [[ -n "$CONTROL_PLANE_HOST" ]]; then
  export SAAS_CONTROL_PLANE_HOST="$CONTROL_PLANE_HOST"
  export SAAS_SMTP_PUBLIC_HOST="${SAAS_SMTP_PUBLIC_HOST:-$CONTROL_PLANE_HOST}"
  export SAAS_TENANT_SMTP_HOST="${SAAS_TENANT_SMTP_HOST:-$CONTROL_PLANE_HOST}"
  export SAAS_TENANT_MAILER_TEMPLATES_BASE="${SAAS_TENANT_MAILER_TEMPLATES_BASE:-http://${CONTROL_PLANE_HOST}:${TEMPLATES_SERVER_PUBLISH_PORT:-8095}}"
else
  export SAAS_TENANT_SMTP_HOST="${SAAS_TENANT_SMTP_HOST:-$SMTP_HOST}"
fi
export SAAS_TENANT_SMTP_PORT="${SAAS_TENANT_SMTP_PORT:-$SMTP_PORT}"
export SAAS_TENANT_SMTP_USER="${SAAS_TENANT_SMTP_USER:-$SMTP_USER}"
export SAAS_TENANT_SMTP_PASS="${SAAS_TENANT_SMTP_PASS:-$SMTP_PASS}"
export SAAS_TENANT_SMTP_ADMIN_EMAIL="${SAAS_TENANT_SMTP_ADMIN_EMAIL:-$SMTP_ADMIN_EMAIL}"
export SAAS_TENANT_SMTP_SENDER_NAME="${SAAS_TENANT_SMTP_SENDER_NAME:-$SMTP_SENDER_NAME}"

ENV_FILE="$DOCKER_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

set_env_kv() {
  local key="$1" val="$2" file="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
  else
    echo "${key}=${val}" >>"$file"
  fi
}

set_env_kv ENABLE_EMAIL_AUTOCONFIRM "$ENABLE_EMAIL_AUTOCONFIRM" "$ENV_FILE"
set_env_kv SMTP_HOST "$SMTP_HOST" "$ENV_FILE"
set_env_kv SMTP_PORT "$SMTP_PORT" "$ENV_FILE"
set_env_kv SMTP_USER "$SMTP_USER" "$ENV_FILE"
set_env_kv SMTP_PASS "$SMTP_PASS" "$ENV_FILE"
set_env_kv SMTP_ADMIN_EMAIL "$SMTP_ADMIN_EMAIL" "$ENV_FILE"
set_env_kv SMTP_SENDER_NAME "$SMTP_SENDER_NAME" "$ENV_FILE"

echo "Updated $ENV_FILE for production SMTP ($SMTP_HOST:$SMTP_PORT)"

cd "$DOCKER_DIR"
docker compose -p "$COMPOSE_PROJECT" -f docker-compose.yml -f docker-compose.dokploy.yml up -d --force-recreate auth

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
if [[ ! -d "$REPO_ROOT/docker" ]]; then
  REPO_ROOT="$(cd "$DOCKER_DIR/.." && pwd)"
fi
if [[ -f "$REPO_ROOT/docker/scripts/repair-tenant-stacks-on-vps.sh" ]]; then
  get_env() { grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '\r' || true; }
  export POSTGRES_PASSWORD="$(get_env POSTGRES_PASSWORD)"
  export SAAS_DATA_PLANE_AUX_ROLE_PASSWORD="$(get_env SAAS_DATA_PLANE_AUX_ROLE_PASSWORD)"
  export PG_ADMIN_PASSWORD="${PG_ADMIN_PASSWORD:-$POSTGRES_PASSWORD}"
  export SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_ADMIN_EMAIL SMTP_SENDER_NAME
  export SAAS_TENANT_SMTP_HOST SAAS_TENANT_SMTP_PORT SAAS_TENANT_SMTP_USER SAAS_TENANT_SMTP_PASS
  export SAAS_TENANT_SMTP_ADMIN_EMAIL SAAS_TENANT_SMTP_SENDER_NAME
  bash "$REPO_ROOT/docker/scripts/repair-tenant-stacks-on-vps.sh"
else
  echo "WARN: repair-tenant-stacks-on-vps.sh not found; patch tenants manually" >&2
fi

STUDIO_SVC="$(docker service ls --format '{{.Name}}' | grep -E "${STUDIO_FILTER}" | head -1 || true)"
if [[ -n "$STUDIO_SVC" ]]; then
  docker service update \
    --env-rm SMTP_HOST --env-rm SMTP_PORT --env-rm SMTP_USER --env-rm SMTP_PASS \
    --env-rm SMTP_ADMIN_EMAIL --env-rm SMTP_SENDER_NAME --env-rm ENABLE_EMAIL_AUTOCONFIRM \
    --env-rm SAAS_TENANT_SMTP_HOST --env-rm SAAS_TENANT_SMTP_PORT --env-rm SAAS_TENANT_SMTP_USER \
    --env-rm SAAS_TENANT_SMTP_PASS --env-rm SAAS_TENANT_SMTP_ADMIN_EMAIL --env-rm SAAS_TENANT_SMTP_SENDER_NAME \
    --env-add "SMTP_HOST=${SMTP_HOST}" \
    --env-add "SMTP_PORT=${SMTP_PORT}" \
    --env-add "SMTP_USER=${SMTP_USER}" \
    --env-add "SMTP_PASS=${SMTP_PASS}" \
    --env-add "SMTP_ADMIN_EMAIL=${SMTP_ADMIN_EMAIL}" \
    --env-add "SMTP_SENDER_NAME=${SMTP_SENDER_NAME}" \
    --env-add "ENABLE_EMAIL_AUTOCONFIRM=${ENABLE_EMAIL_AUTOCONFIRM}" \
    --env-add "SAAS_TENANT_SMTP_HOST=${SAAS_TENANT_SMTP_HOST}" \
    --env-add "SAAS_TENANT_SMTP_PORT=${SAAS_TENANT_SMTP_PORT}" \
    --env-add "SAAS_TENANT_SMTP_USER=${SAAS_TENANT_SMTP_USER}" \
    --env-add "SAAS_TENANT_SMTP_PASS=${SAAS_TENANT_SMTP_PASS}" \
    --env-add "SAAS_TENANT_SMTP_ADMIN_EMAIL=${SAAS_TENANT_SMTP_ADMIN_EMAIL}" \
    --env-add "SAAS_TENANT_SMTP_SENDER_NAME=${SAAS_TENANT_SMTP_SENDER_NAME}" \
    "$STUDIO_SVC" >/dev/null
  echo "Updated Swarm service $STUDIO_SVC SMTP env"
fi

echo "Done. Verify: docker inspect indobase-auth --format '{{range .Config.Env}}{{println .}}{{end}}' | grep SMTP"
