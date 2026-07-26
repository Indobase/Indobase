#!/usr/bin/env bash
# Staging smoke for studio-design.indobase.fun (run on Vyom .249).
set -euo pipefail

APP=indobase-design-v2-design-app-1
BASE=https://studio-design.indobase.fun
COOKIE_JAR=$(mktemp)
HEADERS=$(mktemp)
SPA=$(mktemp)
JS=$(mktemp)
cleanup() { rm -f "$COOKIE_JAR" "$HEADERS" "$SPA" "$JS"; }
trap cleanup EXIT

TOKEN=$(docker exec "$APP" node -e '
const crypto = require("crypto");
const secret = process.env.DESIGN_HANDOFF_SECRET;
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const now = Math.floor(Date.now() / 1000);
const payload = b64url(JSON.stringify({
  aud: "indobase-design",
  sub: "00000000-0000-4000-8000-000000000001",
  email: "smoke@indobase.fun",
  role: "admin",
  project_ref: "smokeproj",
  iat: now,
  exp: now + 300,
}));
const data = header + "." + payload;
const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
process.stdout.write(data + "." + sig);
')
echo "TOKEN_LEN=${#TOKEN}"

RESP=$(curl -sk -m 15 -c "$COOKIE_JAR" -D "$HEADERS" \
  -X POST "$BASE/sso/session" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}")
echo "SESSION_BODY=$RESP"
grep -iE '^(HTTP/|set-cookie:)' "$HEADERS" | head -10 || true

curl -sk -m 15 -b "$COOKIE_JAR" -o "$SPA" -w "spa=%{http_code}\n" "$BASE/"
grep -oE 'index-[A-Za-z0-9_-]+\.(js|css)' "$SPA" | head

ASSET=$(grep -oE 'index-[A-Za-z0-9_-]+\.js' "$SPA" | head -1)
curl -sk -m 15 -b "$COOKIE_JAR" -o "$JS" "$BASE/assets/$ASSET"
echo "ASSET=$ASSET SIZE=$(wc -c < "$JS")"
echo -n "Layers_count="; grep -c Layers "$JS" || true
grep -oE '"jpg"|"svg"|"pdf"|Layers' "$JS" | sort | uniq -c || true

CREATE=$(curl -sk -m 15 -b "$COOKIE_JAR" -X POST "$BASE/api/designs" \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Design","width":1080,"height":1080}')
echo "CREATE=$CREATE"
DID=$(printf '%s' "$CREATE" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("id",""))')
echo "DID=$DID"

curl -sk -m 15 -b "$COOKIE_JAR" "$BASE/api/designs" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("count", len(d) if isinstance(d,list) else d)'

if [ -n "$DID" ]; then
  CANVAS='{"version":"5.3.0","objects":[{"type":"rect","left":100,"top":100,"width":200,"height":120,"fill":"#6366f1"}],"background":"#ffffff"}'
  SAVE=$(curl -sk -m 15 -b "$COOKIE_JAR" -X PUT "$BASE/api/designs/$DID" \
    -H "Content-Type: application/json" \
    -d "{\"canvas_json\":$CANVAS}")
  echo "SAVE_DESIGN=$SAVE"
  PAGE=$(curl -sk -m 15 -b "$COOKIE_JAR" -X POST "$BASE/api/pages" \
    -H "Content-Type: application/json" \
    -d "{\"design_id\":\"$DID\",\"title\":\"Page 1\",\"canvas_json\":$CANVAS}")
  echo "CREATE_PAGE=$PAGE"
  PAGE_ID=$(printf '%s' "$PAGE" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("id",""))' 2>/dev/null || true)
  if [ -n "$PAGE_ID" ]; then
    PSAVE=$(curl -sk -m 15 -b "$COOKIE_JAR" -X PUT "$BASE/api/pages/$PAGE_ID" \
      -H "Content-Type: application/json" \
      -d "{\"canvas_json\":$CANVAS}")
    echo "SAVE_PAGE=$PSAVE"
  fi
  DETAIL=$(curl -sk -m 15 -b "$COOKIE_JAR" "$BASE/api/designs/$DID")
  echo "DETAIL=$(printf '%s' "$DETAIL" | python3 -c 'import sys,json; d=json.load(sys.stdin); print({k:d.get(k) for k in ["id","name","width","height"]}, "pages", len(d.get("pages",[])))')"
fi

curl -sk -m 15 -b "$COOKIE_JAR" "$BASE/api/templates" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("templates", len(d))'
echo SMOKE_DONE
