#!/bin/sh
# Ensure a system-admin personal access token exists for the Discuss SSO bridge.
# Idempotent: reuses /secrets/admin_token when present and still valid.
set -eu

MM_URL="${MATTERMOST_URL:-http://discuss-mattermost:8065}"
ADMIN_EMAIL="${MATTERMOST_ADMIN_EMAIL:-discuss-admin@indobase.local}"
ADMIN_USER="${MATTERMOST_ADMIN_USERNAME:-ibdiscuss}"
ADMIN_PASS="${MATTERMOST_ADMIN_PASSWORD:?MATTERMOST_ADMIN_PASSWORD required}"
TOKEN_FILE="${TOKEN_FILE:-/secrets/admin_token}"

mkdir -p "$(dirname "$TOKEN_FILE")"

log() { echo "[discuss-bootstrap] $*"; }

wait_ping() {
  i=0
  while [ "$i" -lt 90 ]; do
    if curl -fsS "$MM_URL/api/v4/system/ping" >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 2
  done
  log "Mattermost did not become ready"
  exit 1
}

api() {
  method="$1"
  path="$2"
  shift 2
  curl -fsS -X "$method" "$MM_URL$path" \
    -H "Content-Type: application/json" \
    "$@"
}

token_ok() {
  tok="$1"
  [ -n "$tok" ] || return 1
  code=$(curl -sS -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $tok" \
    "$MM_URL/api/v4/users/me" || true)
  [ "$code" = "200" ]
}

wait_ping

if [ -f "$TOKEN_FILE" ]; then
  existing=$(tr -d '[:space:]' <"$TOKEN_FILE" || true)
  if token_ok "$existing"; then
    log "existing admin token is valid"
    # Keep container alive so depends_on service_started is stable; sleep forever.
    exec sleep infinity
  fi
  log "stale token — recreating"
fi

# Login or create first admin (open signup is disabled after first user exists).
login_json=$(curl -sS -X POST "$MM_URL/api/v4/users/login" \
  -H "Content-Type: application/json" \
  -D /tmp/mm-login.hdr \
  -d "{\"login_id\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" || true)

session=$(awk -F': ' 'tolower($1)=="token" {gsub(/\r/,"",$2); print $2; exit}' /tmp/mm-login.hdr 2>/dev/null || true)

if [ -z "$session" ]; then
  log "admin login failed — creating user $ADMIN_EMAIL"
  create=$(curl -sS -w "\n%{http_code}" -X POST "$MM_URL/api/v4/users" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" || true)
  code=$(printf '%s\n' "$create" | tail -n1)
  if [ "$code" != "201" ] && [ "$code" != "200" ]; then
    log "create user failed (HTTP $code): $(printf '%s\n' "$create" | sed '$d')"
    # Retry login in case another replica created the user.
    curl -sS -X POST "$MM_URL/api/v4/users/login" \
      -H "Content-Type: application/json" \
      -D /tmp/mm-login.hdr \
      -d "{\"login_id\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" >/dev/null || true
    session=$(awk -F': ' 'tolower($1)=="token" {gsub(/\r/,"",$2); print $2; exit}' /tmp/mm-login.hdr 2>/dev/null || true)
  else
    curl -sS -X POST "$MM_URL/api/v4/users/login" \
      -H "Content-Type: application/json" \
      -D /tmp/mm-login.hdr \
      -d "{\"login_id\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" >/dev/null
    session=$(awk -F': ' 'tolower($1)=="token" {gsub(/\r/,"",$2); print $2; exit}' /tmp/mm-login.hdr 2>/dev/null || true)
  fi
fi

if [ -z "$session" ]; then
  log "could not obtain session for admin"
  exit 1
fi

user_id=$(curl -fsS -H "Authorization: Bearer $session" "$MM_URL/api/v4/users/me" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
if [ -z "$user_id" ]; then
  log "could not resolve admin user id"
  exit 1
fi

# Promote to system admin (no-op if already).
curl -fsS -X PUT "$MM_URL/api/v4/users/$user_id/roles" \
  -H "Authorization: Bearer $session" \
  -H "Content-Type: application/json" \
  -d '{"roles":"system_admin system_user"}' >/dev/null || true

# Personal access tokens require the permission; enable via config patch if needed.
tok_body=$(curl -sS -X POST "$MM_URL/api/v4/users/$user_id/tokens" \
  -H "Authorization: Bearer $session" \
  -H "Content-Type: application/json" \
  -d '{"description":"indobase-discuss-bridge"}')

pat=$(printf '%s' "$tok_body" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p' | head -1)
if [ -z "$pat" ]; then
  log "PAT create failed: $tok_body"
  # Fall back to session token (expires) so bridge can still boot for smoke.
  pat="$session"
  log "falling back to session token (rotate via MATTERMOST_ADMIN_TOKEN later)"
fi

umask 077
printf '%s' "$pat" >"$TOKEN_FILE"
log "wrote admin token to $TOKEN_FILE"
exec sleep infinity
