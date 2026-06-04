#!/usr/bin/env bash
# Quick smoke checks for Adral on Indobase (no OAuth).
set -euo pipefail

REF="${PROJECT_REF:-adralproject-uspulzkzew}"
BASE="https://${REF}.indobase.in"
STAGING="${STAGING_URL:-https://adral-staging.indobase.in}"
TENANT_COMPOSE="${TENANT_COMPOSE:-/var/lib/docker/volumes/indobase-backend-bmqhan_tenants-data/_data/${REF}/docker-compose.yml}"

anon="$(python3 -c "import re; t=open('${TENANT_COMPOSE}').read(); print(re.search(r\"SUPABASE_ANON_KEY:\\s*'([^']+)'\", t).group(1))" 2>/dev/null || true)"
secret="$(python3 -c "import re; t=open('${TENANT_COMPOSE}').read(); print(re.search(r'SCHEDULE_CRON_SECRET:\s*\"([^\"]+)\"', t).group(1))" 2>/dev/null || true)"

check() { printf '%-28s' "$1"; curl -sS -o /dev/null -w '%{http_code}\n' --max-time 12 "${@:2}"; }

echo "Tenant ${REF}"
check "REST health" "${BASE}/rest/v1/"
check "Auth health" "${BASE}/auth/v1/health"
check "Functions root" "${BASE}/functions/v1/"
check "list-models" "${BASE}/functions/v1/list-models"
if [[ -n "$anon" ]]; then
  check "profiles (anon)" "${BASE}/rest/v1/profiles?select=id&limit=1" -H "apikey: ${anon}" -H "Authorization: Bearer ${anon}"
fi
if [[ -n "$secret" ]]; then
  check "cron dispatch" -X POST "${BASE}/functions/v1/scheduled-tasks-dispatch" \
    -H "Content-Type: application/json" -H "X-Schedule-Cron-Secret: ${secret}" -d '{}'
fi
echo ""
echo "Staging ${STAGING}"
check "home" "${STAGING}/"
check "config.js" "${STAGING}/config.js"
