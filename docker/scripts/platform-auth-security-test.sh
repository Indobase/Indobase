#!/usr/bin/env bash
# Platform auth security regression (GoTrue at api.indobase.in/auth/v1).
# Run on VPS (needs ANON_KEY + SERVICE_ROLE_KEY from platform .env):
#   bash docker/scripts/platform-auth-security-test.sh
#
# Optional:
#   ENV_FILE=/etc/dokploy/compose/indobase-backend-bmqhan/code/docker/.env
#   AUTH_BASE=https://api.indobase.in/auth/v1
#   BRUTE_FORCE_ATTEMPTS=12
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/dokploy/compose/indobase-backend-bmqhan/code/docker/.env}"
AUTH_BASE="${AUTH_BASE:-https://api.indobase.in/auth/v1}"
BRUTE_FORCE_ATTEMPTS="${BRUTE_FORCE_ATTEMPTS:-12}"
STUDIO_REDIRECT="${STUDIO_REDIRECT:-https://studio.indobase.in}"

PASS_COUNT=0
FAIL=0
SKIP=0

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
skip() { yellow "SKIP  $1"; SKIP=$((SKIP + 1)); }

assert_ok() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    green "PASS  $name"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    red "FAIL  $name"
    FAIL=$((FAIL + 1))
  fi
}

assert_fail() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    red "FAIL  $name (expected failure)"
    FAIL=$((FAIL + 1))
  else
    green "PASS  $name"
    PASS_COUNT=$((PASS_COUNT + 1))
  fi
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing ENV_FILE=$ENV_FILE" >&2
  exit 1
fi

ANON_KEY=$(grep -m1 '^ANON_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r"')
SERVICE_KEY=$(grep -m1 '^SERVICE_ROLE_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r"')
JWT_SECRET=$(grep -m1 '^JWT_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r"')
JWT_EXP=$(grep -m1 '^JWT_EXPIRY=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r"')
GITHUB_ENABLED=$(grep -m1 '^GITHUB_ENABLED=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r"' || echo false)
GOOGLE_ENABLED=$(grep -m1 '^GOOGLE_ENABLED=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r"' || echo false)

auth_curl() {
  curl -sS "$@" -H "apikey: $ANON_KEY"
}

auth_json() {
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    auth_curl -X "$method" "$AUTH_BASE$path" -H "Content-Type: application/json" -d "$body"
  else
    auth_curl -X "$method" "$AUTH_BASE$path"
  fi
}

admin_json() {
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sS -X "$method" "$AUTH_BASE$path" \
      -H "apikey: $SERVICE_KEY" \
      -H "Authorization: Bearer $SERVICE_KEY" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -sS -X "$method" "$AUTH_BASE$path" \
      -H "apikey: $SERVICE_KEY" \
      -H "Authorization: Bearer $SERVICE_KEY"
  fi
}

confirm_user() {
  local user_id="$1"
  admin_json PUT "/admin/users/$user_id" '{"email_confirm":true}' >/dev/null
}

signup_user() {
  local email="$1" pass="$2"
  auth_json POST /signup "{\"email\":\"$email\",\"password\":\"$pass\"}"
}

login_user() {
  local email="$1" pass="$2"
  auth_json POST "/token?grant_type=password" "{\"email\":\"$email\",\"password\":\"$pass\"}"
}

http_code() {
  local outfile="$1"
  shift
  curl -sS -o "$outfile" -w "%{http_code}" "$@"
}

section() {
  echo ""
  yellow "=== $1 ==="
}

RUN_ID=$(date +%s)
EMAIL="qa-auth-suite-${RUN_ID}@indobase-qa.invalid"
PASS="QaAuth-$(openssl rand -hex 8)"

section "Email/password signup, login, logout"
SIGNUP=$(signup_user "$EMAIL" "$PASS")
USER_ID=$(echo "$SIGNUP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || true)
[[ -n "$USER_ID" ]] && assert_ok "signup returns user id" test -n "$USER_ID" || assert_ok "signup returns user id" false

confirm_user "$USER_ID"
LOGIN=$(login_user "$EMAIL" "$PASS")
ACCESS=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)
REFRESH=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('refresh_token',''))" 2>/dev/null || true)
assert_ok "password login returns tokens" test -n "$ACCESS" -a -n "$REFRESH"

LOGOUT_CODE=$(http_code /tmp/logout.json -X POST "$AUTH_BASE/logout" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" -d "{\"refresh_token\":\"$REFRESH\"}")
assert_ok "logout returns 204" test "$LOGOUT_CODE" = "204"

POST_LOGOUT=$(http_code /tmp/post_logout.json -X POST "$AUTH_BASE/token?grant_type=refresh_token" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH\"}")
assert_fail "refresh revoked after logout" test "$POST_LOGOUT" = "200"

section "JWT signed with platform secret; exp matches JWT_EXPIRY"
export LOGIN_JSON="$LOGIN" JWT_SECRET JWT_EXP
python3 <<'PY'
import json, os, sys, hmac, hashlib, base64

def check():
    login = json.loads(os.environ["LOGIN_JSON"])
    token = login["access_token"]
    secret = os.environ["JWT_SECRET"].encode()
    header_b64, payload_b64, sig_b64 = token.split(".")
    def b64url_decode(s):
        s += "=" * (-len(s) % 4)
        return base64.urlsafe_b64decode(s)
    payload = json.loads(b64url_decode(payload_b64))
    signing_input = f"{header_b64}.{payload_b64}".encode()
    expected = hmac.new(secret, signing_input, hashlib.sha256).digest()
    actual = b64url_decode(sig_b64)
    if not hmac.compare_digest(expected, actual):
        return False
    delta = int(payload["exp"]) - int(payload["iat"])
    want = int(os.environ["JWT_EXP"])
    if delta != want:
        return False
    if payload.get("aud") != "authenticated":
        return False
    return True

sys.exit(0 if check() else 1)
PY
if [[ $? -eq 0 ]]; then green "PASS  JWT signature and expiry"; PASS_COUNT=$((PASS_COUNT + 1)); else red "FAIL  JWT signature and expiry"; FAIL=$((FAIL + 1)); fi

section "Refresh token rotation / reuse detection"
EMAIL2="qa-auth-rotate-${RUN_ID}@indobase-qa.invalid"
PASS2="QaAuth-$(openssl rand -hex 8)"
su2=$(signup_user "$EMAIL2" "$PASS2")
uid2=$(echo "$su2" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
confirm_user "$uid2"
li2=$(login_user "$EMAIL2" "$PASS2")
ref1=$(echo "$li2" | python3 -c "import sys,json; print(json.load(sys.stdin)['refresh_token'])")
rot=$(auth_json POST "/token?grant_type=refresh_token" "{\"refresh_token\":\"$ref1\"}")
ref2=$(echo "$rot" | python3 -c "import sys,json; print(json.load(sys.stdin).get('refresh_token',''))" 2>/dev/null || true)
assert_ok "refresh returns new refresh_token" test -n "$ref2"

# Advance the session counter, then wait past the reuse grace window (v2 fail-to-save).
REUSE_INTERVAL_SEC=$(grep -m1 '^GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '\r"' || echo "10")
REUSE_INTERVAL_SEC=${REUSE_INTERVAL_SEC:-10}
if [[ -n "$ref2" ]]; then
  http_code /tmp/advance.json -X POST "$AUTH_BASE/token?grant_type=refresh_token" \
    -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
    -d "{\"refresh_token\":\"$ref2\"}" >/dev/null
  sleep "$((REUSE_INTERVAL_SEC + 1))"
fi

reuse_code=$(http_code /tmp/reuse.json -X POST "$AUTH_BASE/token?grant_type=refresh_token" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$ref1\"}")
if [[ "$reuse_code" = "400" || "$reuse_code" = "401" ]]; then
  green "PASS  old refresh token rejected after rotation"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  red "FAIL  old refresh token still accepted (check GOTRUE_SECURITY_REFRESH_TOKEN_* settings)"
  FAIL=$((FAIL + 1))
fi

section "OAuth providers redirect"
if [[ "$GITHUB_ENABLED" = "true" ]]; then
  gh_code=$(http_code /tmp/gh.json "$AUTH_BASE/authorize?provider=github&redirect_to=${STUDIO_REDIRECT}" -H "apikey: $ANON_KEY")
  assert_ok "GitHub authorize redirects (3xx)" test "${gh_code:0:1}" = "3"
else
  skip "GitHub OAuth (GITHUB_ENABLED=false)"
fi
if [[ "$GOOGLE_ENABLED" = "true" ]]; then
  go_code=$(http_code /tmp.go.json "$AUTH_BASE/authorize?provider=google&redirect_to=${STUDIO_REDIRECT}" -H "apikey: $ANON_KEY")
  assert_ok "Google authorize redirects (3xx)" test "${go_code:0:1}" = "3"
else
  skip "Google OAuth (GOOGLE_ENABLED=false)"
fi

section "Password reset email + single-use recovery token"
EMAIL3="qa-auth-recover-${RUN_ID}@indobase-qa.invalid"
PASS3="QaAuth-$(openssl rand -hex 8)"
su3=$(signup_user "$EMAIL3" "$PASS3")
uid3=$(echo "$su3" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
confirm_user "$uid3"
recover_code=$(http_code /tmp.recover.json -X POST "$AUTH_BASE/recover" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL3\"}")
assert_ok "recover endpoint accepts request (2xx)" test "${recover_code:0:1}" = "2"

link=$(admin_json POST /admin/generate_link "{\"type\":\"recovery\",\"email\":\"$EMAIL3\"}")
otp=$(echo "$link" | python3 -c "import sys,json; print(json.load(sys.stdin).get('email_otp',''))")
v1_code=$(http_code /tmp.recv1.json -X POST "$AUTH_BASE/verify" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"type\":\"recovery\",\"token\":\"$otp\",\"email\":\"$EMAIL3\"}")
assert_ok "recovery token verifies once" test "$v1_code" = "200"
v2_code=$(http_code /tmp.recv2.json -X POST "$AUTH_BASE/verify" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"type\":\"recovery\",\"token\":\"$otp\",\"email\":\"$EMAIL3\"}")
assert_fail "recovery token single-use" test "$v2_code" = "200"

section "Brute-force lockout after N failed attempts"
EMAIL4="qa-auth-bf-${RUN_ID}@indobase-qa.invalid"
PASS4="QaAuth-$(openssl rand -hex 8)"
su4=$(signup_user "$EMAIL4" "$PASS4")
uid4=$(echo "$su4" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
confirm_user "$uid4"
locked=false
for i in $(seq 1 "$BRUTE_FORCE_ATTEMPTS"); do
  code=$(http_code "/tmp/bf${i}.json" -X POST "$AUTH_BASE/token?grant_type=password" \
    -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL4\",\"password\":\"wrong-${i}\"}")
  body=$(cat "/tmp/bf${i}.json")
  if echo "$body" | grep -qiE 'lock|ban|too many|rate'; then
    locked=true
    break
  fi
  if [[ "$code" = "429" ]]; then
    locked=true
    break
  fi
done
if $locked; then
  green "PASS  brute-force protection triggered"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  red "FAIL  no account lockout after ${BRUTE_FORCE_ATTEMPTS} bad passwords (configure hook or WAF)"
  FAIL=$((FAIL + 1))
fi

section "Magic link login + single-use"
EMAIL5="qa-auth-magic-${RUN_ID}@indobase-qa.invalid"
PASS5="QaAuth-$(openssl rand -hex 8)"
su5=$(signup_user "$EMAIL5" "$PASS5")
uid5=$(echo "$su5" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
confirm_user "$uid5"
mlink=$(admin_json POST /admin/generate_link "{\"type\":\"magiclink\",\"email\":\"$EMAIL5\"}")
motp=$(echo "$mlink" | python3 -c "import sys,json; print(json.load(sys.stdin).get('email_otp',''))")
m1=$(http_code /tmp.m1.json -X POST "$AUTH_BASE/verify" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"type\":\"magiclink\",\"token\":\"$motp\",\"email\":\"$EMAIL5\"}")
assert_ok "magic link verifies" test "$m1" = "200"
m2=$(http_code /tmp.m2.json -X POST "$AUTH_BASE/verify" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"type\":\"magiclink\",\"token\":\"$motp\",\"email\":\"$EMAIL5\"}")
assert_fail "magic link single-use" test "$m2" = "200"

section "Logout invalidates all sessions (global scope)"
EMAIL6="qa-auth-global-${RUN_ID}@indobase-qa.invalid"
PASS6="QaAuth-$(openssl rand -hex 8)"
su6=$(signup_user "$EMAIL6" "$PASS6")
uid6=$(echo "$su6" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
confirm_user "$uid6"
l6a=$(login_user "$EMAIL6" "$PASS6")
l6b=$(login_user "$EMAIL6" "$PASS6")
r6a=$(echo "$l6a" | python3 -c "import sys,json; print(json.load(sys.stdin)['refresh_token'])")
r6b=$(echo "$l6b" | python3 -c "import sys,json; print(json.load(sys.stdin)['refresh_token'])")
a6a=$(echo "$l6a" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
assert_ok "two sessions get distinct refresh tokens" test "$r6a" != "$r6b"
gcode=$(http_code /tmp.glo.json -X POST "$AUTH_BASE/logout" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $a6a" \
  -H "Content-Type: application/json" -d '{"scope":"global"}')
assert_ok "global logout returns 204" test "$gcode" = "204"
for tok in "$r6a" "$r6b"; do
  c=$(http_code /tmp.glr.json -X POST "$AUTH_BASE/token?grant_type=refresh_token" \
    -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
    -d "{\"refresh_token\":\"$tok\"}")
  assert_fail "all refresh tokens invalid after global logout" test "$c" = "200"
done

echo ""
yellow "=== Summary ==="
green "PASS: $PASS_COUNT"
[[ "$FAIL" -gt 0 ]] && red "FAIL: $FAIL" || echo "FAIL: $FAIL"
yellow "SKIP: $SKIP"
[[ "$FAIL" -gt 0 ]] && exit 1
exit 0
