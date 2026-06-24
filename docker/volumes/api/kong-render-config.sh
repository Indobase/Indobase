#!/usr/bin/env bash
set -euo pipefail

# Render kong.yml from temp.yml by substituting only known compose placeholders.
# Do not use shell eval: Lua/nginx config contains characters that break bash parsing.
if command -v perl >/dev/null 2>&1; then
  perl -pe '
    s/\$SUPABASE_ANON_KEY/$ENV{SUPABASE_ANON_KEY}/g;
    s/\$SUPABASE_SERVICE_KEY/$ENV{SUPABASE_SERVICE_KEY}/g;
    s/\$DASHBOARD_USERNAME/$ENV{DASHBOARD_USERNAME}/g;
    s/\$DASHBOARD_PASSWORD/$ENV{DASHBOARD_PASSWORD}/g;
    s/\$SITE_URL/$ENV{SITE_URL}/g;
    s/\$API_EXTERNAL_URL/$ENV{API_EXTERNAL_URL}/g;
    s/\$CORS_TENANT_ORIGIN_REGEX/$ENV{CORS_TENANT_ORIGIN_REGEX}/g;
  ' /home/kong/temp.yml > /home/kong/kong.yml
else
  cp /home/kong/temp.yml /home/kong/kong.yml
  for key in SUPABASE_ANON_KEY SUPABASE_SERVICE_KEY DASHBOARD_USERNAME DASHBOARD_PASSWORD SITE_URL API_EXTERNAL_URL CORS_TENANT_ORIGIN_REGEX; do
    val="${!key:-}"
    esc=$(printf '%s' "$val" | sed 's/[&/\]/\\&/g')
    sed -i "s#\\\$$key#$esc#g" /home/kong/kong.yml
  done
fi

exec /docker-entrypoint.sh kong docker-start
