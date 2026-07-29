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
APP_REPO_NAME="crm"
APP_GIT_URL="https://github.com/frappe/crm"
APP_GIT_BRANCH="main"
INDOBASE_APP="indobase_crm"
INDOBASE_SRC="/workspace/indobase_crm"
HANDOFF_KEY="crm_handoff_secret"

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

refresh_indobase_app() {
  if [ -d "${INDOBASE_SRC}" ]; then
    rm -rf "apps/${INDOBASE_APP}"
    cp -r "${INDOBASE_SRC}" "apps/${INDOBASE_APP}"
    find "apps/${INDOBASE_APP}" -name "._*" -delete 2>/dev/null || true
    if [ -f sites/apps.txt ] && [ -s sites/apps.txt ] && [ "$(tail -c1 sites/apps.txt | wc -l)" -eq 0 ]; then
      echo >> sites/apps.txt
    fi
    if ! grep -qx "${INDOBASE_APP}" sites/apps.txt 2>/dev/null; then
      echo "${INDOBASE_APP}" >> sites/apps.txt
    fi
    ./env/bin/pip install -e "apps/${INDOBASE_APP}" --quiet || true
    if [ -n "${SITE:-}" ] && [ -d "sites/${SITE}" ]; then
      bench --site "${SITE}" install-app "${INDOBASE_APP}" || true
    fi
  fi
}

sync_handoff_secrets() {
  if [ -z "${HANDOFF_SECRET}" ]; then
    echo "[${LABEL}] WARN: ${HANDOFF_KEY} unset — Studio SSO handoff will fail until env is set"
    return 0
  fi
  bench set-config -g "${HANDOFF_KEY}" "${HANDOFF_SECRET}" || true
  bench set-config -g studio_handoff_secret "${HANDOFF_SECRET}" || true
  bench set-config -g studio_public_url "${STUDIO_PUBLIC_URL:-https://studio.indobase.in}" || true
  if [ -n "${SITE:-}" ] && [ -d "sites/${SITE}" ]; then
    bench --site "${SITE}" set-config "${HANDOFF_KEY}" "${HANDOFF_SECRET}" || true
    bench --site "${SITE}" set-config studio_handoff_secret "${HANDOFF_SECRET}" || true
    bench --site "${SITE}" clear-cache || true
  fi
}

start_existing() {
  echo "[${LABEL}] bench exists — starting"
  cd frappe-bench
  refresh_indobase_app
  sync_handoff_secrets
  exec bench start
}

ensure_apps_and_site() {
  cd frappe-bench
  bench set-mariadb-host crm-mariadb
  bench set-redis-cache-host redis://crm-redis:6379
  bench set-redis-queue-host redis://crm-redis:6379
  bench set-redis-socketio-host redis://crm-redis:6379
  sed -i '/redis/d' ./Procfile || true
  sed -i '/watch/d' ./Procfile || true

  if [ ! -d "apps/${APP_REPO_NAME}/crm" ] && [ ! -f "apps/${APP_REPO_NAME}/pyproject.toml" ] && [ ! -f "apps/${APP_REPO_NAME}/setup.py" ]; then
    rm -rf "apps/${APP_REPO_NAME}"
  fi
  if [ ! -d "apps/${APP_REPO_NAME}" ]; then
    bench get-app "${APP_REPO_NAME}" "${APP_GIT_URL}" --branch "${APP_GIT_BRANCH}"
  else
    # Retry yarn if previous get-app timed out mid-install.
    (cd "apps/${APP_REPO_NAME}" && yarn install --check-files) || \
      bench get-app "${APP_REPO_NAME}" "${APP_GIT_URL}" --branch "${APP_GIT_BRANCH}" || true
  fi
  rm -rf "apps/${INDOBASE_APP}"
  cp -r "${INDOBASE_SRC}" "apps/${INDOBASE_APP}"
  find "apps/${INDOBASE_APP}" -name "._*" -delete 2>/dev/null || true
  if [ -f sites/apps.txt ] && [ -s sites/apps.txt ] && [ "$(tail -c1 sites/apps.txt | wc -l)" -eq 0 ]; then
    echo >> sites/apps.txt
  fi
  if ! grep -qx "${INDOBASE_APP}" sites/apps.txt 2>/dev/null; then
    echo "${INDOBASE_APP}" >> sites/apps.txt
  fi
  ./env/bin/pip install -e "apps/${INDOBASE_APP}" --quiet || true

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
