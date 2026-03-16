#!/usr/bin/env bash
set -euo pipefail

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

if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 1
fi

# Generate secrets
AUTH_JWT_SECRET="$(openssl rand -hex 32)"
PG_META_CRYPTO_KEY="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)"

# Generate Indobase anon + service JWTs using the helper script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVAL_OUTPUT="$(AUTH_JWT_SECRET="$AUTH_JWT_SECRET" node "$SCRIPT_DIR/gen-indobase-keys.mjs")"

# Extract ANON_KEY and SERVICE_ROLE_KEY from script output
eval "$EVAL_OUTPUT"

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

