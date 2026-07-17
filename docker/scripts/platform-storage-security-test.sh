#!/usr/bin/env bash
# Storage API security + performance regression (tenant stack on VPS).
#   bash docker/scripts/platform-storage-security-test.sh
#
# Env:
#   ENV_FILE, STORAGE_TENANT, STORAGE_PORT (auto from docker if unset)
#   LARGE_FILE_MB (default 49; set to 0 to skip large-object test; 5GB test needs LARGE_FILE_MB=5120+ and time)
#   CONCURRENT_UPLOADS (default 8)
#   SIGNED_URL_TTL_SEC (default 4)
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/dokploy/compose/indobase-backend-bmqhan/code/docker/.env}"
STORAGE_TENANT="${STORAGE_TENANT:-peaqlabs-yawgparzpv}"
LARGE_FILE_MB="${LARGE_FILE_MB:-49}"
CONCURRENT_UPLOADS="${CONCURRENT_UPLOADS:-8}"
SIGNED_URL_TTL_SEC="${SIGNED_URL_TTL_SEC:-4}"
RUN_ID="${RUN_ID:-$(date +%s)}"

PASS_COUNT=0
FAIL=0
SKIP=0

red() { printf '\033[31mFAIL\033[0m  %s\n' "$*"; }
green() { printf '\033[32mPASS\033[0m  %s\n' "$*"; }
yellow() { printf '\033[33mSKIP\033[0m  %s\n' "$*"; }
section() { printf '\n\033[33m=== %s ===\033[0m\n' "$*"; }

assert_ok() {
  local name="$1"
  shift
  if "$@"; then
    green "$name"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    red "$name"
    FAIL=$((FAIL + 1))
  fi
}

assert_fail() {
  local name="$1"
  shift
  if "$@"; then
    red "$name (expected failure)"
    FAIL=$((FAIL + 1))
  else
    green "$name"
    PASS_COUNT=$((PASS_COUNT + 1))
  fi
}

skip() {
  yellow "$1"
  SKIP=$((SKIP + 1))
}

[[ -f "$ENV_FILE" ]] || { echo "Missing ENV_FILE=$ENV_FILE" >&2; exit 1; }

SERVICE_KEY=$(grep -m1 '^SERVICE_ROLE_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r"')
ANON_KEY=$(grep -m1 '^ANON_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r"')

STORAGE_CTN="indobase-tenant-${STORAGE_TENANT}-tenant-storage-1"
if ! docker inspect "$STORAGE_CTN" >/dev/null 2>&1; then
  STORAGE_CTN="${STORAGE_TENANT}.indobase-storage"
fi

if [[ -z "${STORAGE_PORT:-}" ]]; then
  STORAGE_PORT=$(docker port "$STORAGE_CTN" 5000/tcp 2>/dev/null | head -1 | cut -d: -f2)
fi
[[ -n "$STORAGE_PORT" ]] || { echo "Could not resolve storage port for $STORAGE_CTN" >&2; exit 1; }

STORAGE_BASE="http://127.0.0.1:${STORAGE_PORT}"
FILE_SIZE_LIMIT=$(docker exec "$STORAGE_CTN" printenv FILE_SIZE_LIMIT 2>/dev/null || echo 52428800)
ENABLE_XFORM=$(docker exec "$STORAGE_CTN" printenv ENABLE_IMAGE_TRANSFORMATION 2>/dev/null || echo false)

SK=$(docker exec "$STORAGE_CTN" printenv SERVICE_KEY 2>/dev/null || echo "$SERVICE_KEY")
AK=$(docker exec "$STORAGE_CTN" printenv ANON_KEY 2>/dev/null || echo "$ANON_KEY")

st_curl() {
  curl -sS "$@" -H "apikey: $SK" -H "Authorization: Bearer $SK"
}

st_code() {
  curl -sS -o /dev/null -w "%{http_code}" "$@" -H "apikey: $SK" -H "Authorization: Bearer $SK"
}

st_code_anon() {
  curl -sS -o /dev/null -w "%{http_code}" "$@" -H "apikey: $AK"
}

ensure_bucket() {
  local name="$1" public="$2"
  st_curl -X POST "$STORAGE_BASE/bucket" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$name\",\"public\":$public,\"file_size_limit\":$FILE_SIZE_LIMIT}" >/dev/null 2>&1 || true
}

upload_file() {
  local bucket="$1" path="$2" file="$3"
  st_curl -X POST "$STORAGE_BASE/object/$bucket/$path" -F "file=@$file"
}

download_file() {
  local bucket="$1" path="$2" out="$3"
  st_curl "$STORAGE_BASE/object/$bucket/$path" -o "$out"
}

delete_object() {
  local bucket="$1" path="$2"
  st_curl -X DELETE "$STORAGE_BASE/object/$bucket/$path" >/dev/null
}

PUBLIC_BUCKET="qa-st-pub-${RUN_ID}"
PRIVATE_BUCKET="qa-st-prv-${RUN_ID}"
TMPDIR="/tmp/qa-st-${RUN_ID}"
mkdir -p "$TMPDIR"

# Standard 1x1 PNG (well-formed; imgproxy upscales for width/height > 1)
echo 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+n8X8AAAAASUVORK5CYII=' | base64 -d >"$TMPDIR/transform.png"

section "Setup ($STORAGE_TENANT port $STORAGE_PORT, limit ${FILE_SIZE_LIMIT} bytes)"
ensure_bucket "$PUBLIC_BUCKET" true
ensure_bucket "$PRIVATE_BUCKET" false

section "Upload / download / delete (max configured size)"
if [[ "$FILE_SIZE_LIMIT" -lt 5368709120 ]]; then
  skip "5GB object test (FILE_SIZE_LIMIT=${FILE_SIZE_LIMIT} < 5GB; set FILE_SIZE_LIMIT on storage to test 5GB)"
fi

if [[ "$LARGE_FILE_MB" -gt 0 ]]; then
  LARGE_BYTES=$((LARGE_FILE_MB * 1024 * 1024))
  if [[ "$LARGE_BYTES" -gt "$FILE_SIZE_LIMIT" ]]; then
    LARGE_BYTES=$((FILE_SIZE_LIMIT - 1048576))
    LARGE_FILE_MB=$((LARGE_BYTES / 1024 / 1024))
  fi
  LARGE_PATH="large-${RUN_ID}.bin"
  LARGE_FILE="$TMPDIR/$LARGE_PATH"
  dd if=/dev/urandom of="$LARGE_FILE" bs=1M count="$LARGE_FILE_MB" status=none 2>/dev/null
  LARGE_MD5=$(md5sum "$LARGE_FILE" | awk '{print $1}')

  if upload_file "$PUBLIC_BUCKET" "$LARGE_PATH" "$LARGE_FILE" | grep -q '"Key"'; then
    assert_ok "upload ${LARGE_FILE_MB}MB file succeeds" true
  else
    assert_ok "upload ${LARGE_FILE_MB}MB file succeeds" false
  fi

  download_file "$PUBLIC_BUCKET" "$LARGE_PATH" "$TMPDIR/dl-large.bin"
  DL_MD5=$(md5sum "$TMPDIR/dl-large.bin" | awk '{print $1}')
  assert_ok "download ${LARGE_FILE_MB}MB matches upload checksum" test "$DL_MD5" = "$LARGE_MD5"

  delete_object "$PUBLIC_BUCKET" "$LARGE_PATH"
  CODE=$(st_code "$STORAGE_BASE/object/$PUBLIC_BUCKET/$LARGE_PATH")
  assert_ok "delete removes object (GET returns 404/400)" test "$CODE" = "404" -o "$CODE" = "400"
fi

section "Signed URL TTL and expiry"
echo "signed-payload-${RUN_ID}" >"$TMPDIR/sign.txt"
OBJ_PATH="sign-${RUN_ID}.txt"
upload_file "$PRIVATE_BUCKET" "$OBJ_PATH" "$TMPDIR/sign.txt" >/dev/null

SIG_JSON=$(st_curl -X POST "$STORAGE_BASE/object/sign/$PRIVATE_BUCKET" \
  -H "Content-Type: application/json" \
  -d "{\"paths\":[\"$OBJ_PATH\"],\"expiresIn\":$SIGNED_URL_TTL_SEC}")
SIG_PATH=$(printf '%s' "$SIG_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['signedURL'])")

CODE_NOW=$(curl -sS -o "$TMPDIR/sig-now.txt" -w "%{http_code}" "$STORAGE_BASE$SIG_PATH")
assert_ok "signed URL works before expiry (HTTP 200)" test "$CODE_NOW" = "200"

sleep $((SIGNED_URL_TTL_SEC + 2))
CODE_EXP=$(curl -sS -o /dev/null -w "%{http_code}" "$STORAGE_BASE$SIG_PATH")
assert_ok "signed URL rejected after TTL (HTTP 400)" test "$CODE_EXP" = "400"

SIG_JSON2=$(st_curl -X POST "$STORAGE_BASE/object/sign/$PRIVATE_BUCKET" \
  -H "Content-Type: application/json" \
  -d "{\"paths\":[\"$OBJ_PATH\"],\"expiresIn\":60}")
SIG_PATH2=$(printf '%s' "$SIG_JSON2" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['signedURL'])")
C1=$(curl -sS -o /dev/null -w "%{http_code}" "$STORAGE_BASE$SIG_PATH2")
C2=$(curl -sS -o /dev/null -w "%{http_code}" "$STORAGE_BASE$SIG_PATH2")
assert_ok "signed URL valid within TTL on repeated GET (Supabase: reusable until exp)" test "$C1" = "200" -a "$C2" = "200"

section "Public vs private bucket access"
PUB_OBJ="pub-${RUN_ID}.txt"
echo public >"$TMPDIR/pub.txt"
upload_file "$PUBLIC_BUCKET" "$PUB_OBJ" "$TMPDIR/pub.txt" >/dev/null
PRV_OBJ="prv-${RUN_ID}.txt"
echo private >"$TMPDIR/prv.txt"
upload_file "$PRIVATE_BUCKET" "$PRV_OBJ" "$TMPDIR/prv.txt" >/dev/null

CODE_PUB_ANON=$(st_code_anon "$STORAGE_BASE/object/public/$PUBLIC_BUCKET/$PUB_OBJ")
assert_ok "public bucket readable without auth" test "$CODE_PUB_ANON" = "200"

CODE_PRV_ANON=$(st_code_anon "$STORAGE_BASE/object/public/$PRIVATE_BUCKET/$PRV_OBJ")
assert_fail "private bucket blocked for anonymous" test "$CODE_PRV_ANON" = "200"

CODE_PRV_AUTH=$(st_code "$STORAGE_BASE/object/$PRIVATE_BUCKET/$PRV_OBJ")
assert_ok "private bucket readable with service role" test "$CODE_PRV_AUTH" = "200"

section "Image transformation (resize + format)"
upload_file "$PUBLIC_BUCKET" "transform.png" "$TMPDIR/transform.png" >/dev/null
sleep 1
if [[ "$ENABLE_XFORM" != "true" ]]; then
  skip "image transformation disabled (ENABLE_IMAGE_TRANSFORMATION != true)"
else
  RENDER_CODE=$(curl -sS -o "$TMPDIR/render.avif" -w "%{http_code}" \
    -H "Accept: image/avif,image/*,*/*" \
    "$STORAGE_BASE/render/image/public/$PUBLIC_BUCKET/transform.png?width=32&height=32&resize=contain&format=avif")
  if [[ "$RENDER_CODE" = "200" ]] && file "$TMPDIR/render.avif" | grep -qiE 'AVIF|PNG|ISO Media|image'; then
    assert_ok "resize + avif conversion returns image bytes" true
  else
    ERR=$(head -c 200 "$TMPDIR/render.avif" 2>/dev/null || true)
    if echo "$ERR" | grep -q 'Source image is unreachable'; then
      red "image transform (imgproxy cannot reach tenant file — check IMGPROXY_URL, GLOBAL_S3_BUCKET, shared volume)"
      FAIL=$((FAIL + 1))
    else
      red "image transform (HTTP $RENDER_CODE: $ERR)"
      FAIL=$((FAIL + 1))
    fi
  fi

  RENDER_ORG=$(curl -sS -o "$TMPDIR/render.png" -w "%{http_code}" \
    -H "Accept: image/*,*/*" \
    "$STORAGE_BASE/render/image/public/$PUBLIC_BUCKET/transform.png?width=16&height=16&resize=cover&format=origin")
  if [[ "$RENDER_ORG" = "200" ]] && file "$TMPDIR/render.png" | grep -qi 'PNG'; then
    assert_ok "resize with origin format returns PNG" true
  else
    red "resize origin format (HTTP $RENDER_ORG)"
    FAIL=$((FAIL + 1))
  fi
fi

upload_with_retry() {
  local bucket="$1" path="$2" file="$3"
  local attempt code
  for attempt in 1 2 3 4 5; do
    code=$(st_code -X POST "$STORAGE_BASE/object/$bucket/$path" -F "file=@$file")
    if [[ "$code" = "200" ]]; then
      return 0
    fi
    if [[ "$code" = "429" ]]; then
      sleep $((attempt))
      continue
    fi
    return 1
  done
  return 1
}

download_with_retry() {
  local bucket="$1" path="$2" out="$3"
  local attempt code
  for attempt in 1 2 3 4 5; do
    code=$(curl -sS -o "$out" -w "%{http_code}" "$STORAGE_BASE/object/$bucket/$path" \
      -H "apikey: $SK" -H "Authorization: Bearer $SK")
    if [[ "$code" = "200" ]]; then
      return 0
    fi
    if [[ "$code" = "429" ]]; then
      sleep $((attempt))
      continue
    fi
    return 1
  done
  return 1
}

section "Concurrent multipart uploads (${CONCURRENT_UPLOADS} parallel)"
FAIL_CONC=0
PIDS=()
for i in $(seq 1 "$CONCURRENT_UPLOADS"); do
  (
    F="$TMPDIR/conc-$i.bin"
    echo "conc-$i-$RUN_ID" >"$F"
    MD5=$(md5sum "$F" | awk '{print $1}')
    PATH_O="conc-$i-${RUN_ID}.txt"
    upload_with_retry "$PUBLIC_BUCKET" "$PATH_O" "$F" || exit 1
    download_with_retry "$PUBLIC_BUCKET" "$PATH_O" "$TMPDIR/conc-dl-$i.bin" || exit 1
    MD5_DL=$(md5sum "$TMPDIR/conc-dl-$i.bin" | awk '{print $1}')
    [[ "$MD5" = "$MD5_DL" ]] || exit 1
  ) &
  PIDS+=($!)
done
for pid in "${PIDS[@]}"; do
  wait "$pid" || FAIL_CONC=$((FAIL_CONC + 1))
done
assert_ok "all $CONCURRENT_UPLOADS parallel upload/download checksums match" test "$FAIL_CONC" -eq 0

section "Storage quota / size limit enforcement"
OVER_MB=$((FILE_SIZE_LIMIT / 1024 / 1024 + 2))
OVER_FILE="$TMPDIR/over.bin"
dd if=/dev/zero of="$OVER_FILE" bs=1M count="$OVER_MB" status=none 2>/dev/null || true
OVER_RESP=$(st_curl -w "\n%{http_code}" -X POST "$STORAGE_BASE/object/$PUBLIC_BUCKET/over-${RUN_ID}.bin" -F "file=@$OVER_FILE" 2>/dev/null | tail -1)
OVER_BODY=$(st_curl -X POST "$STORAGE_BASE/object/$PUBLIC_BUCKET/over-${RUN_ID}.bin" -F "file=@$OVER_FILE" 2>/dev/null || true)
if echo "$OVER_BODY" | grep -qiE 'Payload too large|EntityTooLarge|exceeded'; then
  assert_ok "oversized upload returns clean error (413/EntityTooLarge)" true
else
  assert_ok "oversized upload rejected (HTTP ${OVER_RESP:-?})" test "${OVER_RESP:-400}" != "200"
fi

section "Cleanup"
for b in "$PUBLIC_BUCKET" "$PRIVATE_BUCKET"; do
  st_curl -X DELETE "$STORAGE_BASE/bucket/$b" >/dev/null 2>&1 || true
done
rm -rf "$TMPDIR"

section "Summary"
green "PASS: $PASS_COUNT"
if [[ "$FAIL" -gt 0 ]]; then red "FAIL: $FAIL"; else printf 'FAIL: %s\n' "$FAIL"; fi
yellow "SKIP: $SKIP"
exit "$([[ "$FAIL" -eq 0 ]] && echo 0 || echo 1)"
