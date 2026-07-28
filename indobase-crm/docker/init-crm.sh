#!/usr/bin/env bash
# Initialize Frappe bench with Frappe CRM + indobase_crm on first boot.
# Persist volume must be mounted at /home/frappe/persist (uid 1000 writable).
set -euo pipefail

SITE="${CRM_SITE_NAME:-crm.localhost}"
ROOT_PW="${MARIADB_ROOT_PASSWORD:-123}"
ADMIN_PW="${CRM_ADMIN_PASSWORD:-admin}"
HANDOFF_SECRET="${CRM_HANDOFF_SECRET:-}"
PERSIST="${FRAPPE_PERSIST_DIR:-/home/frappe/persist}"
LABEL="crm"

mkdir -p "${PERSIST}"
cd "${PERSIST}"

bench_ready() {
  [ -d "frappe-bench/apps/frappe" ] \
    && [ -x "frappe-bench/env/bin/python" ] \
    && frappe-bench/env/bin/python -c "import frappe" 2>/dev/null
}

if [ -d "frappe-bench" ] && ! bench_ready; then
  echo "[${LABEL}] incomplete bench — removing for clean re-init"
  rm -rf frappe-bench
fi

if bench_ready; then
  echo "[${LABEL}] bench exists — starting"
  cd frappe-bench
  bench set-config -g crm_handoff_secret "${HANDOFF_SECRET}" || true
  bench set-config -g studio_handoff_secret "${HANDOFF_SECRET}" || true
  bench set-config -g studio_public_url "${STUDIO_PUBLIC_URL:-https://studio.indobase.in}" || true
  exec bench start
fi

echo "[${LABEL}] creating bench…"
export CI="${CI:-1}"
bench init --skip-redis-config-generation frappe-bench --version version-15
cd frappe-bench

bench set-mariadb-host crm-mariadb
bench set-redis-cache-host redis://crm-redis:6379
bench set-redis-queue-host redis://crm-redis:6379
bench set-redis-socketio-host redis://crm-redis:6379

sed -i '/redis/d' ./Procfile || true
sed -i '/watch/d' ./Procfile || true

bench get-app crm https://github.com/frappe/crm --branch main
cp -r /workspace/indobase_crm ./apps/indobase_crm

bench new-site "${SITE}" \
  --force \
  --mariadb-root-password "${ROOT_PW}" \
  --admin-password "${ADMIN_PW}" \
  --no-mariadb-socket

bench --site "${SITE}" install-app crm
bench --site "${SITE}" install-app indobase_crm
bench --site "${SITE}" set-config developer_mode 0
bench --site "${SITE}" set-config mute_emails 1
bench --site "${SITE}" set-config crm_handoff_secret "${HANDOFF_SECRET}"
bench --site "${SITE}" set-config studio_handoff_secret "${HANDOFF_SECRET}"
bench --site "${SITE}" set-config studio_public_url "${STUDIO_PUBLIC_URL:-https://studio.indobase.in}"
bench --site "${SITE}" clear-cache
bench use "${SITE}"

echo "[${LABEL}] bench ready — starting"
exec bench start
