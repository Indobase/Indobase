#!/usr/bin/env bash
# Verify wildcard DNS for per-project tenant API hosts (ref.<SAAS_PUBLIC_DOMAIN>).
set -euo pipefail

PUBLIC_DOMAIN="${SAAS_PUBLIC_DOMAIN:-api.indobase.in}"
VPS_IP="${VPS_IP:-187.77.30.165}"
PROBE_REF="${1:-dns-probe-$(date +%s)}"
HOST="${PROBE_REF}.${PUBLIC_DOMAIN}"

echo "Tenant API domain: ${PUBLIC_DOMAIN}"
echo "Probe host: ${HOST}"
echo ""

resolved=$(dig +short "$HOST" A 2>/dev/null | head -1 || true)
if [[ -z "$resolved" ]]; then
  echo "FAIL: ${HOST} does not resolve (NXDOMAIN)."
  echo ""
  echo "Add DNS at your registrar (Hostinger hPanel for indobase.in):"
  if [[ "$PUBLIC_DOMAIN" == api.indobase.in ]]; then
    echo "  Type: A   Name: *.api   Points to: ${VPS_IP}"
  else
    echo "  Type: A   Name: *       Points to: ${VPS_IP}   (when apex zone is ${PUBLIC_DOMAIN})"
    echo "  Or:   Type: A   Name: *.${PUBLIC_DOMAIN%%.*}  (adjust for your DNS UI)"
  fi
  echo ""
  echo "After DNS propagates, re-run: SAAS_PUBLIC_DOMAIN=${PUBLIC_DOMAIN} $0"
  exit 1
fi

echo "OK: ${HOST} -> ${resolved}"
if [[ "$resolved" != "$VPS_IP" ]]; then
  echo "WARN: expected ${VPS_IP}, got ${resolved}"
fi

code=$(curl -sS -o /dev/null -w "%{http_code}" --connect-timeout 5 "https://${HOST}/rest/v1/" 2>/dev/null || echo "000")
echo "HTTPS /rest/v1/ -> ${code}"
if [[ "$code" == "000" ]]; then
  echo "WARN: HTTPS probe failed (Traefik or tenant stack may still be down)"
  exit 2
fi
echo "Tenant API edge is reachable."
