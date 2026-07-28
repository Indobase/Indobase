#!/usr/bin/env bash
# Initialize Frappe bench with Gameplan + indobase_discuss on first boot.
set -euo pipefail

SITE="${DISCUSS_SITE_NAME:-discuss.localhost}"
ROOT_PW="${MARIADB_ROOT_PASSWORD:-123}"
ADMIN_PW="${DISCUSS_ADMIN_PASSWORD:-admin}"
HANDOFF_SECRET="${DISCUSS_HANDOFF_SECRET:-}"

cd /home/frappe

if [ -d "frappe-bench/apps/frappe" ]; then
  echo "[discuss] bench exists — starting"
  cd frappe-bench
  bench set-config -g discuss_handoff_secret "${HANDOFF_SECRET}" || true
  bench set-config -g studio_handoff_secret "${HANDOFF_SECRET}" || true
  bench set-config -g studio_public_url "${STUDIO_PUBLIC_URL:-https://studio.indobase.in}" || true
  bench start
  exit 0
fi

echo "[discuss] creating bench…"
bench init --skip-redis-config-generation frappe-bench
cd frappe-bench

bench set-mariadb-host discuss-mariadb
bench set-redis-cache-host redis://discuss-redis:6379
bench set-redis-queue-host redis://discuss-redis:6379
bench set-redis-socketio-host redis://discuss-redis:6379

sed -i '/redis/d' ./Procfile || true
sed -i '/watch/d' ./Procfile || true

bench get-app gameplan https://github.com/frappe/gameplan
cp -r /workspace/indobase_discuss ./apps/indobase_discuss

bench new-site "${SITE}" \
  --force \
  --mariadb-root-password "${ROOT_PW}" \
  --admin-password "${ADMIN_PW}" \
  --no-mariadb-socket

bench --site "${SITE}" install-app gameplan
bench --site "${SITE}" install-app indobase_discuss
bench --site "${SITE}" set-config developer_mode 0
bench --site "${SITE}" set-config mute_emails 1
bench --site "${SITE}" set-config discuss_handoff_secret "${HANDOFF_SECRET}"
bench --site "${SITE}" set-config studio_handoff_secret "${HANDOFF_SECRET}"
bench --site "${SITE}" set-config studio_public_url "${STUDIO_PUBLIC_URL:-https://studio.indobase.in}"
bench --site "${SITE}" clear-cache
bench use "${SITE}"

echo "[discuss] bench ready — starting"
bench start
