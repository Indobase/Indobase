#!/usr/bin/env bash
set -e

# Helper script to generate secure secrets and print an env block
# suitable for docker/.env and your dashboard runtime.
#
# It does NOT write any files; it only prints to stdout.
#
# Usage (from repo root or docker/):
#   bash docker/indobase-env-helper.sh

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required" >&2
  exit 1
fi

base64url() {
  # stdin -> base64url (no padding)
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

make_jwt() {
  local role="$1"
  local header payload header_b64 payload_b64 sig

  header='{"alg":"HS256","typ":"JWT"}'
  payload="{\"role\":\"$role\",\"iss\":\"indobase\"}"

  header_b64="$(printf '%s' "$header" | base64url)"
  payload_b64="$(printf '%s' "$payload" | base64url)"

  sig="$(
    printf '%s' "$header_b64.$payload_b64" |
      openssl dgst -binary -sha256 -hmac "$AUTH_JWT_SECRET" |
      base64url
  )"

  printf '%s.%s.%s' "$header_b64" "$payload_b64" "$sig"
}

# Generate secrets
AUTH_JWT_SECRET="$(openssl rand -hex 32)"
PG_META_CRYPTO_KEY="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)"

# Generate Indobase anon + service JWTs
ANON_KEY="$(make_jwt anon)"
SERVICE_ROLE_KEY="$(make_jwt service_role)"

cat <<EOF

# --------- Indobase backend secrets (copy into docker/.env and Dokploy) ---------
AUTH_JWT_SECRET=$AUTH_JWT_SECRET
PG_META_CRYPTO_KEY=$PG_META_CRYPTO_KEY

ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY

SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_KEY=$SERVICE_ROLE_KEY
# -------------------------------------------------------------------------------
EOF

