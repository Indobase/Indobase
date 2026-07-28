#!/usr/bin/env bash
# Initialize Frappe bench with Frappe Helpdesk + indobase_helpdesk on first boot.
set -euo pipefail

SITE="${HELPDESK_SITE_NAME:-helpdesk.localhost}"
ROOT_PW="${MARIADB_ROOT_PASSWORD:-123}"
ADMIN_PW="${HELPDESK_ADMIN_PASSWORD:-admin}"
HANDOFF_SECRET="${HELPDESK_HANDOFF_SECRET:-}"

cd /home/frappe

if [ -d "frappe-bench/apps/frappe" ]; then
  echo "[helpdesk] bench exists — starting"
  cd frappe-bench
  bench set-config -g helpdesk_handoff_secret "${HANDOFF_SECRET}" || true
  bench set-config -g studio_handoff_secret "${HANDOFF_SECRET}" || true
  bench set-config -g studio_public_url "${STUDIO_PUBLIC_URL:-https://studio.indobase.in}" || true
  bench start
  exit 0
fi

echo "[helpdesk] creating bench…"
bench init --skip-redis-config-generation frappe-bench --version version-15
cd frappe-bench

bench set-mariadb-host helpdesk-mariadb
bench set-redis-cache-host redis://helpdesk-redis:6379
bench set-redis-queue-host redis://helpdesk-redis:6379
bench set-redis-socketio-host redis://helpdesk-redis:6379

sed -i '/redis/d' ./Procfile || true
sed -i '/watch/d' ./Procfile || true

bench get-app helpdesk https://github.com/frappe/helpdesk --branch main
cp -r /workspace/indobase_helpdesk ./apps/indobase_helpdesk

bench new-site "${SITE}" \
  --force \
  --mariadb-root-password "${ROOT_PW}" \
  --admin-password "${ADMIN_PW}" \
  --no-mariadb-socket

bench --site "${SITE}" install-app helpdesk
bench --site "${SITE}" install-app indobase_helpdesk
bench --site "${SITE}" set-config developer_mode 0
bench --site "${SITE}" set-config mute_emails 1
bench --site "${SITE}" set-config helpdesk_handoff_secret "${HANDOFF_SECRET}"
bench --site "${SITE}" set-config studio_handoff_secret "${HANDOFF_SECRET}"
bench --site "${SITE}" set-config studio_public_url "${STUDIO_PUBLIC_URL:-https://studio.indobase.in}"
bench --site "${SITE}" clear-cache
bench use "${SITE}"

echo "[helpdesk] bench ready — starting"
bench start
