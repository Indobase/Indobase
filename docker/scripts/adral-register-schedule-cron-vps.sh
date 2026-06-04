#!/usr/bin/env bash
# Register Adral scheduled-tasks-dispatch in postgres DB (pg_cron).
set -euo pipefail

REF="${PROJECT_REF:-adralproject-uspulzkzew}"
TENANT_DIR="${TENANT_DIR:-/var/lib/docker/volumes/indobase-backend-bmqhan_tenants-data/_data/${REF}}"
COMPOSE="${TENANT_DIR}/docker-compose.yml"
DISPATCH_URL="${DISPATCH_URL:-https://${REF}.indobase.in/functions/v1/scheduled-tasks-dispatch}"

SECRET="$(python3 - <<PY
import re, sys
text = open("${COMPOSE}").read()
m = re.search(r'SCHEDULE_CRON_SECRET:\s*"([^"]+)"', text)
if not m:
    sys.exit("SCHEDULE_CRON_SECRET not found in tenant compose")
print(m.group(1))
PY
)"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

cat >"$TMP" <<EOF
select cron.unschedule(jobid)
from cron.job
where jobname = 'adral-scheduled-tasks-dispatch';

select cron.schedule(
  'adral-scheduled-tasks-dispatch',
  '* * * * *',
  \$\$
  select net.http_post(
    url := '${DISPATCH_URL}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Schedule-Cron-Secret', '${SECRET}'
    ),
    body := '{}'::jsonb
  ) as request_id;
  \$\$
);
EOF

docker exec -i indobase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <"$TMP"
echo "Registered pg_cron job adral-scheduled-tasks-dispatch → ${DISPATCH_URL}"
