#!/usr/bin/env bash
# Deploy branded GoTrue email templates on the control-plane VPS.
#
# Usage (on VPS or via SSH):
#   bash docker/scripts/apply-auth-email-templates-vps.sh
#
# Requires docker compose stack at DOCKER_DIR with templates-server + auth services.
set -euo pipefail

DOCKER_DIR="${DOCKER_DIR:-/opt/indobase/docker}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-indobase}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [[ ! -d "$REPO_ROOT/docker/volumes/templates" ]]; then
  REPO_ROOT="$(cd "$DOCKER_DIR/.." && pwd)"
fi

TEMPLATES_SRC="$REPO_ROOT/docker/volumes/templates"
TEMPLATES_DST="$DOCKER_DIR/volumes/templates"

if [[ ! -d "$TEMPLATES_SRC" ]]; then
  echo "Missing templates at $TEMPLATES_SRC" >&2
  exit 1
fi

mkdir -p "$TEMPLATES_DST"
rsync -a --delete "$TEMPLATES_SRC/" "$TEMPLATES_DST/"

ENV_FILE="$DOCKER_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  set_env_kv() {
    local key="$1" val="$2" file="$3"
    if grep -q "^${key}=" "$file" 2>/dev/null; then
      sed -i "s|^${key}=.*|${key}=${val}|" "$file"
    else
      echo "${key}=${val}" >>"$file"
    fi
  }

  set_env_kv MAILER_TEMPLATES_CONFIRMATION "http://indobase-templates-server/confirmation.html" "$ENV_FILE"
  set_env_kv MAILER_TEMPLATES_RECOVERY "http://indobase-templates-server/recovery.html" "$ENV_FILE"
  set_env_kv MAILER_TEMPLATES_MAGIC_LINK "http://indobase-templates-server/magic-link.html" "$ENV_FILE"
  set_env_kv MAILER_TEMPLATES_INVITE "http://indobase-templates-server/invite.html" "$ENV_FILE"
  set_env_kv MAILER_TEMPLATES_EMAIL_CHANGE "http://indobase-templates-server/email-change.html" "$ENV_FILE"
  set_env_kv MAILER_URLPATHS_CONFIRMATION "/auth/confirm" "$ENV_FILE"
  set_env_kv MAILER_URLPATHS_INVITE "/auth/confirm" "$ENV_FILE"
  set_env_kv MAILER_URLPATHS_RECOVERY "/auth/confirm" "$ENV_FILE"
  set_env_kv MAILER_URLPATHS_EMAIL_CHANGE "/auth/confirm" "$ENV_FILE"
  set_env_kv ADDITIONAL_REDIRECT_URLS "https://studio.indobase.in/**" "$ENV_FILE"
  set_env_kv MAILER_SUBJECTS_CONFIRMATION "Confirm your Indobase account" "$ENV_FILE"
  set_env_kv MAILER_SUBJECTS_RECOVERY "Reset your Indobase password" "$ENV_FILE"
  set_env_kv MAILER_SUBJECTS_MAGIC_LINK "Your Indobase sign-in link" "$ENV_FILE"
  set_env_kv MAILER_SUBJECTS_INVITE "You are invited to Indobase" "$ENV_FILE"
  set_env_kv MAILER_SUBJECTS_EMAIL_CHANGE "Confirm your new Indobase email" "$ENV_FILE"
  echo "Updated mailer template URLs in $ENV_FILE"
fi

cd "$DOCKER_DIR"
COMPOSE_FILES=(-f docker-compose.yml)
[[ -f docker-compose.dokploy.yml ]] && COMPOSE_FILES+=(-f docker-compose.dokploy.yml)
[[ -f docker-compose.smtp-relay.yml ]] && COMPOSE_FILES+=(-f docker-compose.smtp-relay.yml)

docker compose -p "$COMPOSE_PROJECT" "${COMPOSE_FILES[@]}" up -d templates-server 2>/dev/null || docker start indobase-templates-server >/dev/null 2>&1 || true
docker compose -p "$COMPOSE_PROJECT" "${COMPOSE_FILES[@]}" up -d --force-recreate auth

echo "Verifying templates-server..."
docker exec indobase-templates-server wget -qO- http://127.0.0.1/confirmation.html | head -c 120 | tr '\n' ' '
echo
echo "Verifying auth env..."
docker inspect indobase-auth --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E 'GOTRUE_MAILER_TEMPLATES_CONFIRMATION|GOTRUE_MAILER_SUBJECTS_CONFIRMATION' || true
echo "Done."
