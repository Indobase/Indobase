#!/usr/bin/env bash
# Configure and verify production DNS for zone indobase.in (Hostinger hPanel / optional Cloudflare API).
#
# Zone: indobase.in
# Vyom dual-VPS (see docker/docs/VYOM-DUAL-VPS.md):
#   Control plane (.249): studio, api, builder, status, mail
#   Data plane (.248):    * (wildcard tenant hosts)
# Legacy single-host default (deprecated): 187.77.30.165
# NS:   dns-parking.com (Hostinger) — confirm with: dig +short indobase.in NS
#
# Required A records (all point to VPS_IP):
#   *      — wildcard for <project-ref>.indobase.in tenant APIs (Option A data plane)
#   status — health redirect (see docker/traefik/status-indobase.yml)
#
# Optional:
#   mail   — Inbucket web UI (see docker/traefik/mail-indobase.yml)
#
# Control-plane hosts (api, studio) are separate; add if missing:
#   api    -> VPS, studio -> VPS
#
# Usage:
#   ./docker/scripts/configure-indobase-dns-hostinger.sh
#   VPS_IP=1.2.3.4 ./docker/scripts/configure-indobase-dns-hostinger.sh
#
# Optional Cloudflare API (only if the zone is on Cloudflare, not Hostinger parking NS):
#   export CLOUDFLARE_API_TOKEN=...
#   export ZONE_ID=...   # Cloudflare zone id for indobase.in
#   APPLY=1 ./docker/scripts/configure-indobase-dns-hostinger.sh
#
# Optional Hostinger API (hPanel → Profile → API):
#   export HOSTINGER_API_TOKEN=...
#   APPLY=1 ./docker/scripts/configure-indobase-dns-hostinger.sh
#
set -euo pipefail

ZONE="${ZONE:-indobase.in}"
VPS_IP="${VPS_IP:-187.77.30.165}"
APPLY="${APPLY:-0}"
PROBE_WILDCARD="${PROBE_WILDCARD:-test-wildcard}"

REQUIRED_NAMES=( "*" status )
OPTIONAL_NAMES=( mail )

CONTROL_PLANE_VPS_IP="${CONTROL_PLANE_VPS_IP:-103.190.92.249}"
# Explicit A records on control plane (override wildcard * → data plane .248)
CONTROL_PLANE_A_NAMES=(
  api studio builder builder-v2 status mail
  discuss workspace crm domains
  email social design video analytics payments
)


print_required_records() {
  cat <<EOF

Required DNS records for ${ZONE} (A → ${VPS_IP}):

  Type   Name      Points to        Purpose
  ----   ----      ---------        -------
  A      *         ${VPS_IP}   Wildcard tenant hosts (*.${ZONE})
  A      status    ${VPS_IP}   status.${ZONE} (Traefik health redirect)

Optional:

  A      mail      ${VPS_IP}   mail.${ZONE} (Inbucket web UI)

Also ensure (if not already present):

  A      api       ${VPS_IP}   api.${ZONE}
  A      studio    ${VPS_IP}   studio.${ZONE}

Nameservers (Hostinger): ns1.dns-parking.com, ns2.dns-parking.com

EOF
}

dig_a() {
  dig +short "$1" A 2>/dev/null | head -1 || true
}

verify_host() {
  local host="$1"
  local expected="${2:-$VPS_IP}"
  local ip
  ip=$(dig_a "$host")
  if [[ -z "$ip" ]]; then
    echo "FAIL: ${host} — no A record (NXDOMAIN or not propagated)"
    return 1
  fi
  if [[ "$ip" != "$expected" ]]; then
    echo "WARN: ${host} -> ${ip} (expected ${expected})"
    return 2
  fi
  echo "OK:   ${host} -> ${ip}"
  return 0
}

verify_all() {
  local failed=0
  echo "Verifying DNS (dig)..."
  echo ""
  verify_host "${PROBE_WILDCARD}.${ZONE}" || failed=$((failed + 1))
  verify_host "status.${ZONE}" || failed=$((failed + 1))
  verify_host "mail.${ZONE}" || true
  echo ""
  if [[ "$failed" -gt 0 ]]; then
    echo "${failed} required host(s) missing or wrong."
    return 1
  fi
  echo "All required hosts resolve to ${VPS_IP}."
  return 0
}

print_hostinger_steps() {
  cat <<EOF

--- Hostinger hPanel (DNS Zone Editor for ${ZONE}) ---

1. Log in: https://hpanel.hostinger.com/
2. Domains → ${ZONE} → DNS / DNS Zone
3. Add or edit A records (TTL 300–3600 is fine):

   Type: A    Name: *       Points to: ${VPS_IP}
   Type: A    Name: status   Points to: ${VPS_IP}

   Optional:
   Type: A    Name: mail     Points to: ${VPS_IP}

4. Remove conflicting records for the same names (old CNAME/AAAA).
5. Wait 5–30 minutes, then re-run this script.

Note: If nameservers are dns-parking.com, changes must be made in Hostinger,
not Cloudflare — CLOUDFLARE_API_TOKEN has no effect until NS point to Cloudflare.

EOF
}

cf_api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local url="https://api.cloudflare.com/client/v4/zones/${ZONE_ID}${path}"
  if [[ -n "$data" ]]; then
    curl -sS -X "$method" "$url" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "$data"
  else
    curl -sS -X "$method" "$url" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json"
  fi
}

cf_upsert_a() {
  local name="$1"
  local cf_name
  if [[ "$name" == "*" ]]; then
    cf_name="*"
  else
    cf_name="$name"
  fi

  local list
  list=$(cf_api GET "/dns_records?type=A&name=${cf_name}.${ZONE}" 2>/dev/null || echo '{"success":false}')
  local record_id
  record_id=$(echo "$list" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if not d.get('success'): sys.exit(0)
for r in d.get('result',[]):
  if r.get('name') in ('${cf_name}.${ZONE}','${ZONE}') or r.get('name','').startswith('${cf_name}.'):
    print(r['id']); break
" 2>/dev/null || true)

  local payload
  payload=$(python3 -c "
import json
print(json.dumps({
  'type': 'A',
  'name': '${cf_name}',
  'content': '${VPS_IP}',
  'ttl': 300,
  'proxied': False,
}))
")

  if [[ -n "$record_id" ]]; then
    echo "  Cloudflare: PATCH A ${cf_name} -> ${VPS_IP}"
    cf_api PATCH "/dns_records/${record_id}" "$payload" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if not d.get('success'):
  print('  ERROR:', d.get('errors',d), file=sys.stderr); sys.exit(1)
"
  else
    echo "  Cloudflare: POST A ${cf_name} -> ${VPS_IP}"
    cf_api POST "/dns_records" "$payload" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if not d.get('success'):
  print('  ERROR:', d.get('errors',d), file=sys.stderr); sys.exit(1)
"
  fi
}

apply_cloudflare() {
  echo "Applying records via Cloudflare API (ZONE_ID=${ZONE_ID})..."
  for name in "${REQUIRED_NAMES[@]}"; do
    cf_upsert_a "$name"
  done
  for name in "${OPTIONAL_NAMES[@]}"; do
    cf_upsert_a "$name" || true
  done
  echo ""
}


apply_control_plane_hostinger() {
  echo "Applying control-plane A records (${#CONTROL_PLANE_A_NAMES[@]} hosts) → ${CONTROL_PLANE_VPS_IP}..."
  local zone_json
  zone_json=$(CONTROL_PLANE_VPS_IP="${CONTROL_PLANE_VPS_IP}" python3 <<'EOF'
import json, os
names = [
  "api", "studio", "builder", "builder-v2", "status", "mail",
  "discuss", "workspace", "crm", "domains",
  "email", "social", "design", "video", "analytics", "payments",
]
ip = os.environ["CONTROL_PLANE_VPS_IP"]
records = [{"name": n, "type": "A", "ttl": 300, "records": [{"content": ip}]} for n in names]
print(json.dumps({"overwrite": False, "zone": records}))
EOF
)
  curl -sS -X PUT "https://developers.hostinger.com/api/dns/v1/zones/${ZONE}" \
    -H "Authorization: Bearer ${HOSTINGER_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "$zone_json" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d.get('message', d))
"
  echo ""
}

apply_hostinger() {
  echo "Applying records via Hostinger API (zone=${ZONE})..."
  local zone_json
  zone_json=$(python3 -c "
import json
names = ['*', 'status'] + (['mail'] if True else [])
records = []
for n in ['*', 'status', 'mail']:
    records.append({
        'name': n,
        'type': 'A',
        'ttl': 300,
        'records': [{'content': '${VPS_IP}'}],
    })
print(json.dumps({'overwrite': False, 'zone': records}))
")
  curl -sS -X PUT "https://developers.hostinger.com/api/dns/v1/zones/${ZONE}" \
    -H "Authorization: Bearer ${HOSTINGER_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "$zone_json" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if isinstance(d, dict) and d.get('message') and 'error' in str(d).lower():
  print('Hostinger API error:', d, file=sys.stderr); sys.exit(1)
print('Hostinger API: records submitted (overwrite=false, appends/updates).')
"
  echo ""
}

main() {
  echo "Indobase DNS: zone=${ZONE} vps=${VPS_IP}"
  print_required_records

  ns=$(dig +short "${ZONE}" NS 2>/dev/null | head -2 | tr '\n' ' ' || true)
  echo "Current NS: ${ns:-unknown}"
  echo ""

  if [[ -n "${HOSTINGER_API_TOKEN:-}" ]]; then
    if [[ "$APPLY" == "1" ]]; then
      if [[ "${CONTROL_PLANE_APPLY:-0}" == "1" ]]; then apply_control_plane_hostinger; fi
      apply_hostinger
    else
      echo "HOSTINGER_API_TOKEN set. Re-run with APPLY=1 to upsert A records via Hostinger API."
      echo ""
    fi
  elif [[ -n "${CLOUDFLARE_API_TOKEN:-}" && -n "${ZONE_ID:-}" ]]; then
    if [[ "$APPLY" == "1" ]]; then
      apply_cloudflare
    else
      echo "Cloudflare credentials set. Re-run with APPLY=1 to upsert A records."
      echo ""
    fi
  else
    print_hostinger_steps
  fi

  if verify_all; then
    exit 0
  fi
  exit 1
}

main "$@"
