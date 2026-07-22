#!/usr/bin/env bash
# Wire Hostinger staging (*.indobase.fun) to prod Kong/GoTrue CORS + redirects.
# Run when Vyom control-plane SSH is reachable:
#
#   ./docker/scripts/staging-allowlist-indobase-fun.sh
#
# Updates ADDITIONAL_REDIRECT_URLS / MAILER_EXTERNAL_HOSTS / SITE_URL-adjacent
# allowlists on the platform compose stack, then recreates auth (GoTrue) and
# reloads Kong so https://studio.indobase.fun can call https://api.indobase.in.
set -euo pipefail

SSH_HOST="${VPS_SSH:-root@103.190.92.249}"
SSH_KEY="${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_indobase_vps}"
SSH_OPTS=(-4 -o ConnectTimeout=45 -i "$SSH_KEY")

STUDIO_FUN="${STAGING_STUDIO_URL:-https://studio.indobase.fun}"
BUILDER_FUN="${STAGING_BUILDER_URL:-https://builder.indobase.fun}"

echo "==> Checking SSH ${SSH_HOST}…"
if ! ssh "${SSH_OPTS[@]}" "$SSH_HOST" 'hostname' >/dev/null; then
  echo "::error::Vyom control plane unreachable. Fix SSH/.249 before allowlisting."
  exit 1
fi

ssh "${SSH_OPTS[@]}" "$SSH_HOST" bash -s <<REMOTE
set -euo pipefail
STUDIO_FUN="${STUDIO_FUN}"
BUILDER_FUN="${BUILDER_FUN}"

ENV_CANDIDATES=(
  /etc/indobase/.env
  /opt/indobase/.env
  /root/indobase/docker/.env
  /var/lib/dokploy/compose/*/code/docker/.env
)
ENV_FILE=""
for f in "\${ENV_CANDIDATES[@]}"; do
  # shellcheck disable=SC2086
  for match in \$f; do
    if [[ -f "\$match" ]]; then
      ENV_FILE="\$match"
      break 2
    fi
  done
done

if [[ -z "\$ENV_FILE" ]]; then
  # Fall back: find compose project with gotrue
  ENV_FILE="\$(find /etc /opt /var/lib/dokploy -name '.env' 2>/dev/null | head -20 | while read -r p; do
    grep -q 'ADDITIONAL_REDIRECT_URLS\\|GOTRUE_SITE_URL\\|SITE_URL' "\$p" 2>/dev/null && echo "\$p" && break
  done || true)"
fi

if [[ -z "\$ENV_FILE" || ! -f "\$ENV_FILE" ]]; then
  echo "::error::Could not locate platform .env on .249"
  exit 1
fi

echo "Using env: \$ENV_FILE"
cp -a "\$ENV_FILE" "\${ENV_FILE}.bak.\$(date +%Y%m%d%H%M%S)"

ensure_csv_has() {
  local key="\$1"
  local value="\$2"
  if grep -q "^\${key}=" "\$ENV_FILE"; then
    local cur
    cur="\$(grep "^\${key}=" "\$ENV_FILE" | head -1 | cut -d= -f2-)"
    if [[ "\$cur" == *"\$value"* ]]; then
      echo "  \$key already has \$value"
      return
    fi
    if [[ -z "\$cur" ]]; then
      sed -i "s|^\${key}=.*|\${key}=\${value}|" "\$ENV_FILE"
    else
      sed -i "s|^\${key}=.*|\${key}=\${cur},\${value}|" "\$ENV_FILE"
    fi
  else
    printf '\n%s=%s\n' "\$key" "\$value" >> "\$ENV_FILE"
  fi
  echo "  updated \$key += \$value"
}

# GoTrue allow list (comma-separated globs)
ensure_csv_has ADDITIONAL_REDIRECT_URLS "\${STUDIO_FUN}/**"
ensure_csv_has ADDITIONAL_REDIRECT_URLS "\${BUILDER_FUN}/**"
ensure_csv_has MAILER_EXTERNAL_HOSTS "studio.indobase.fun"
ensure_csv_has MAILER_EXTERNAL_HOSTS "builder.indobase.fun"

# Kong cors origins: SITE_URL is usually studio.indobase.in. Append staging Studio as extra
# origin by widening CORS_TENANT_ORIGIN_REGEX to also match .fun — or set an explicit list
# if your deploy supports CORS_ALLOWED_ORIGINS.
if grep -q '^CORS_TENANT_ORIGIN_REGEX=' "\$ENV_FILE"; then
  # Keep .in tenants; also allow staging Studio/Builder on .fun
  sed -i "s|^CORS_TENANT_ORIGIN_REGEX=.*|CORS_TENANT_ORIGIN_REGEX='~^https://([a-z0-9][a-z0-9-]+\\\\.indobase\\\\.in|studio\\\\.indobase\\\\.fun|builder\\\\.indobase\\\\.fun)\$'|" "\$ENV_FILE"
  echo "  updated CORS_TENANT_ORIGIN_REGEX for .fun staging hosts"
else
  echo "CORS_TENANT_ORIGIN_REGEX='~^https://([a-z0-9][a-z0-9-]+\\\\.indobase\\\\.in|studio\\\\.indobase\\\\.fun|builder\\\\.indobase\\\\.fun)\$'" >> "\$ENV_FILE"
fi

# Also add exact origins if the stack reads SITE_URL only — document for operators.
echo
echo "NOTE: Kong cors also includes \\\$SITE_URL and \\\$API_EXTERNAL_URL."
echo "If preflight still fails, set SITE_URL temporarily to \${STUDIO_FUN} on a"
echo "dedicated staging Kong, or add a Kong plugin origins entry for \${STUDIO_FUN}."

COMPOSE_DIR="\$(dirname "\$ENV_FILE")"
cd "\$COMPOSE_DIR"

if [[ -f docker-compose.yml ]]; then
  echo "==> Recreating auth + kong to pick up env…"
  docker compose up -d --force-recreate auth kong 2>/dev/null \\
    || docker compose -f docker-compose.yml -f docker-compose.dokploy.yml up -d --force-recreate auth kong 2>/dev/null \\
    || docker compose -f docker-compose.yml -f docker-compose.platform-override.yml -f docker-compose.platform-vps.yml up -d --force-recreate auth kong
else
  echo "::warning::No docker-compose.yml next to env — recreate GoTrue/Kong manually."
fi

echo "==> Smoke CORS preflight from this host…"
curl -sS -m 20 -D - -o /dev/null -X OPTIONS "https://api.indobase.in/auth/v1/token" \\
  -H "Origin: \${STUDIO_FUN}" \\
  -H "Access-Control-Request-Method: POST" \\
  -H "Access-Control-Request-Headers: authorization,apikey,content-type" \\
  | tr -d '\\r' | grep -iE 'HTTP/|access-control' || true

echo "Done."
REMOTE
