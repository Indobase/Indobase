#!/usr/bin/env bash
# Render kong.yml from temp.yml without bash eval (Lua $ syntax breaks eval).
# Substitutes only known Kong env placeholders; leaves other $ intact.
set -euo pipefail

cp ~/temp.yml ~/kong.yml
sed -i \
  -e "s|\$SUPABASE_ANON_KEY|${SUPABASE_ANON_KEY}|g" \
  -e "s|\$SUPABASE_SERVICE_KEY|${SUPABASE_SERVICE_KEY}|g" \
  -e "s|\$DASHBOARD_USERNAME|${DASHBOARD_USERNAME}|g" \
  -e "s|\$DASHBOARD_PASSWORD|${DASHBOARD_PASSWORD}|g" \
  -e "s|\$SITE_URL|${SITE_URL}|g" \
  -e "s|\$API_EXTERNAL_URL|${API_EXTERNAL_URL}|g" \
  ~/kong.yml
exec /docker-entrypoint.sh kong docker-start
