#!/usr/bin/env bash
# PocketBase helper for V1.2 live payment cert. Prints only safe JSON. Never echo secrets.
set -euo pipefail
ENV_FILE="${ENV_FILE:-/opt/indobase-builder-cfos.runtime.env}"
ACTION="${1:-}"
shift || true

read_kv() {
  grep -E "^${1}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r'
}

PB_URL="$(read_kv POCKETBASE_ADMIN_URL)"
if [[ -z "$PB_URL" ]]; then
  PB_URL="$(read_kv POCKETBASE_URL)"
fi
PB_URL="${PB_URL%/}"
export PB_EMAIL="$(read_kv POCKETBASE_ADMIN_EMAIL)"
export PB_PASS="$(read_kv POCKETBASE_ADMIN_PASSWORD)"

if [[ -z "$PB_URL" || -z "$PB_EMAIL" || -z "$PB_PASS" ]]; then
  echo '{"ok":false,"error":"pocketbase_env_missing"}'
  exit 1
fi

AUTH_BODY="$(python3 - <<'PY'
import json, os
print(json.dumps({"identity": os.environ["PB_EMAIL"], "password": os.environ["PB_PASS"]}))
PY
)"

TOKEN=""
for path in /api/collections/_superusers/auth-with-password /api/admins/auth-with-password; do
  RESP="$(curl -sS -X POST "${PB_URL}${path}" -H 'Content-Type: application/json' -d "$AUTH_BODY" || true)"
  TOKEN="$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(d.get("token") or "")' "$RESP" 2>/dev/null || true)"
  if [[ -n "$TOKEN" ]]; then
    break
  fi
done

if [[ -z "$TOKEN" ]]; then
  echo '{"ok":false,"error":"pocketbase_auth_failed"}'
  exit 1
fi

enc_filter() {
  python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "$1"
}

pb_get() {
  curl -fsS "$1" -H "Authorization: ${TOKEN}"
}

pb_patch() {
  curl -fsS -X PATCH "$1" -H "Authorization: ${TOKEN}" -H 'Content-Type: application/json' -d "$2"
}

case "$ACTION" in
  order)
    REF="${1:?projectRef}"
    OID="${2:?orderId}"
    pb_get "${PB_URL}/api/collections/ib_${REF}_orders/records/${OID}"
    ;;
  product)
    REF="${1:?projectRef}"
    PID="${2:?productId}"
    pb_get "${PB_URL}/api/collections/ib_${REF}_products/records/${PID}"
    ;;
  reservations)
    REF="${1:?projectRef}"
    OID="${2:?orderId}"
    FILTER="$(enc_filter "order_id=\"${OID}\"")"
    pb_get "${PB_URL}/api/collections/ib_${REF}_inventory_reservations/records?perPage=50&filter=${FILTER}"
    ;;
  backdate-expiry)
    REF="${1:?projectRef}"
    OID="${2:?orderId}"
    PAST="$(python3 - <<'PY'
from datetime import datetime, timezone, timedelta
print((datetime.now(timezone.utc) - timedelta(minutes=5)).strftime("%Y-%m-%d %H:%M:%S.000Z"))
PY
)"
    pb_patch "${PB_URL}/api/collections/ib_${REF}_orders/records/${OID}" \
      "{\"reservation_expires_at\":\"${PAST}\"}" >/dev/null
    FILTER="$(enc_filter "order_id=\"${OID}\"")"
    ROWS="$(pb_get "${PB_URL}/api/collections/ib_${REF}_inventory_reservations/records?perPage=50&filter=${FILTER}")"
    python3 - "$ROWS" "$PB_URL" "ib_${REF}_inventory_reservations" "$TOKEN" "$PAST" <<'PY'
import json, sys, urllib.request
rows = json.loads(sys.argv[1])
base, col, token, past = sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
for item in rows.get("items") or []:
    rid = item.get("id")
    if not rid:
        continue
    req = urllib.request.Request(
        f"{base}/api/collections/{col}/records/{rid}",
        data=json.dumps({"expires_at": past}).encode(),
        headers={"Authorization": token, "Content-Type": "application/json"},
        method="PATCH",
    )
    urllib.request.urlopen(req).read()
print(json.dumps({"ok": True, "reservation_expires_at": past, "rows": len(rows.get("items") or [])}))
PY
    ;;
  *)
    echo '{"ok":false,"error":"unknown_action"}'
    exit 1
    ;;
esac
