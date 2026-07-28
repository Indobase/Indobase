#!/usr/bin/env bash
# Initialize Frappe bench with Frappe Helpdesk + indobase_helpdesk on first boot.
# Persist volume must be mounted at /home/frappe/persist (uid 1000 writable).
set -euo pipefail

SITE="${HELPDESK_SITE_NAME:-helpdesk.localhost}"
ROOT_PW="${MARIADB_ROOT_PASSWORD:-123}"
ADMIN_PW="${HELPDESK_ADMIN_PASSWORD:-admin}"
HANDOFF_SECRET="${HELPDESK_HANDOFF_SECRET:-}"
PERSIST="${FRAPPE_PERSIST_DIR:-/home/frappe/persist}"
LABEL="helpdesk"
APP_REPO_NAME="helpdesk"
APP_GIT_URL="https://github.com/frappe/helpdesk"
APP_GIT_BRANCH="main"
INDOBASE_APP="indobase_helpdesk"
INDOBASE_SRC="/workspace/indobase_helpdesk"
HANDOFF_KEY="helpdesk_handoff_secret"

mkdir -p "${PERSIST}"
cd "${PERSIST}"
export CI="${CI:-1}"

bench_ready() {
  local site
  site="$(cat frappe-bench/sites/currentsite.txt 2>/dev/null || true)"
  [ -n "${site}" ] \
    && [ -d "frappe-bench/sites/${site}" ] \
    && [ -d "frappe-bench/apps/frappe" ] \
    && [ -x "frappe-bench/env/bin/python" ] \
    && frappe-bench/env/bin/python -c "import frappe" 2>/dev/null
}

apps_usable() {
  [ -d "frappe-bench/apps/frappe" ] \
    && [ -x "frappe-bench/env/bin/python" ] \
    && frappe-bench/env/bin/python -c "import frappe" 2>/dev/null
}

start_existing() {
  echo "[${LABEL}] bench exists — starting"
  cd frappe-bench
  bench set-config -g "${HANDOFF_KEY}" "${HANDOFF_SECRET}" || true
  bench set-config -g studio_handoff_secret "${HANDOFF_SECRET}" || true
  bench set-config -g studio_public_url "${STUDIO_PUBLIC_URL:-https://studio.indobase.in}" || true
  exec bench start
}

ensure_apps_and_site() {
  cd frappe-bench
  bench set-mariadb-host helpdesk-mariadb
  bench set-redis-cache-host redis://helpdesk-redis:6379
  bench set-redis-queue-host redis://helpdesk-redis:6379
  bench set-redis-socketio-host redis://helpdesk-redis:6379
  sed -i '/redis/d' ./Procfile || true
  sed -i '/watch/d' ./Procfile || true

  if [ ! -d "apps/${APP_REPO_NAME}" ]; then
    bench get-app "${APP_REPO_NAME}" "${APP_GIT_URL}" --branch "${APP_GIT_BRANCH}"
  fi
  rm -rf "apps/${INDOBASE_APP}"
  cp -r "${INDOBASE_SRC}" "apps/${INDOBASE_APP}"

  if [ ! -d "sites/${SITE}" ]; then
    echo "[${LABEL}] creating site ${SITE}…"
    bench new-site "${SITE}" \
      --force \
      --mariadb-root-password "${ROOT_PW}" \
      --admin-password "${ADMIN_PW}" \
      --no-mariadb-socket
  fi

  bench --site "${SITE}" install-app "${APP_REPO_NAME}" || true
  bench --site "${SITE}" install-app "${INDOBASE_APP}" || true
  bench --site "${SITE}" set-config developer_mode 0
  bench --site "${SITE}" set-config mute_emails 1
  bench --site "${SITE}" set-config "${HANDOFF_KEY}" "${HANDOFF_SECRET}"
  bench --site "${SITE}" set-config studio_handoff_secret "${HANDOFF_SECRET}"
  bench --site "${SITE}" set-config studio_public_url "${STUDIO_PUBLIC_URL:-https://studio.indobase.in}"
  bench --site "${SITE}" clear-cache
  bench use "${SITE}"
  echo "[${LABEL}] bench ready — starting"
  exec bench start
}

if bench_ready; then
  start_existing
fi

if apps_usable; then
  echo "[${LABEL}] apps present but site missing — resuming site setup"
  ensure_apps_and_site
fi

if [ -d "frappe-bench" ]; then
  echo "[${LABEL}] incomplete bench — removing for clean re-init"
  rm -rf frappe-bench
fi

echo "[${LABEL}] creating bench…"
bench init --skip-redis-config-generation frappe-bench --version version-15
ensure_apps_and_site
