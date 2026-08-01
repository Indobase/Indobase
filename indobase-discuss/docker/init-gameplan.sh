#!/usr/bin/env bash
# Initialize Frappe bench with Gameplan + indobase_discuss on first boot.
# Persist volume must be mounted at /home/frappe/persist (uid 1000 writable).
# Gameplan develop requires Frappe v16+ (see upstream README).
set -euo pipefail

SITE="${DISCUSS_SITE_NAME:-discuss.localhost}"
ROOT_PW="${MARIADB_ROOT_PASSWORD:-123}"
ADMIN_PW="${DISCUSS_ADMIN_PASSWORD:-admin}"
HANDOFF_SECRET="${DISCUSS_HANDOFF_SECRET:-}"
PERSIST="${FRAPPE_PERSIST_DIR:-/home/frappe/persist}"
LABEL="discuss"
APP_REPO_NAME="gameplan"
APP_GIT_URL="https://github.com/frappe/gameplan"
APP_GIT_BRANCH="${GAMEPLAN_BRANCH:-develop}"
FRAPPE_BRANCH="${FRAPPE_BRANCH:-version-16}"
INDOBASE_APP="indobase_discuss"
INDOBASE_SRC="/workspace/indobase_discuss"
HANDOFF_KEY="discuss_handoff_secret"

mkdir -p "${PERSIST}"
cd "${PERSIST}"
export CI="${CI:-1}"

bench_ready() {
  # Require a real site — apps/frappe alone is not enough (restart mid-init
  # after get-app must not skip new-site / install-app).
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

ensure_gameplan_frontend_built() {
  if [ ! -d "apps/${APP_REPO_NAME}/frontend" ]; then
    return 0
  fi
  if [ -f "apps/${APP_REPO_NAME}/gameplan/public/frontend/index.html" ] \
    || [ -d "apps/${APP_REPO_NAME}/gameplan/public/frontend" ]; then
    return 0
  fi
  echo "[${LABEL}] building Gameplan frontend (first boot)…"
  (cd "apps/${APP_REPO_NAME}" && yarn install --frozen-lockfile && yarn build) || \
    (cd "apps/${APP_REPO_NAME}" && yarn install && yarn build) || true
  if [ -n "${SITE:-}" ] && [ -d "sites/${SITE}" ]; then
    bench --site "${SITE}" build --app "${APP_REPO_NAME}" || true
    bench --site "${SITE}" clear-cache || true
  fi
}

refresh_indobase_app() {
  # Host mounts may be unreadable to uid 1000; never abort bench start on refresh failure.
  if [ ! -d "${INDOBASE_SRC}" ] || [ ! -r "${INDOBASE_SRC}" ]; then
    echo "[${LABEL}] warn: ${INDOBASE_SRC} not readable — skipping app refresh"
    return 0
  fi
  mkdir -p "apps/${INDOBASE_APP}"
  if ! cp -a "${INDOBASE_SRC}/." "apps/${INDOBASE_APP}/"; then
    echo "[${LABEL}] warn: could not copy ${INDOBASE_APP} — using existing app tree"
    return 0
  fi
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
}

start_existing() {
  echo "[${LABEL}] bench exists — starting"
  cd frappe-bench
  refresh_indobase_app
  ensure_gameplan_frontend_built
  # Keep global + site configs in lockstep. Site-level keys win over -g in frappe.conf;
  # updating only -g leaves a stale discuss_handoff_secret and SSO fails with
  # "Invalid or expired handoff token" after secret rotation.
  if [ -n "${HANDOFF_SECRET}" ]; then
    bench set-config -g "${HANDOFF_KEY}" "${HANDOFF_SECRET}" || true
    bench set-config -g studio_handoff_secret "${HANDOFF_SECRET}" || true
    if [ -n "${SITE:-}" ] && [ -d "sites/${SITE}" ]; then
      bench --site "${SITE}" set-config "${HANDOFF_KEY}" "${HANDOFF_SECRET}" || true
      bench --site "${SITE}" set-config studio_handoff_secret "${HANDOFF_SECRET}" || true
    fi
  fi
  bench set-config -g studio_public_url "${STUDIO_PUBLIC_URL:-https://studio.indobase.in}" || true
  if [ -n "${SITE:-}" ] && [ -d "sites/${SITE}" ]; then
    bench --site "${SITE}" set-config studio_public_url "${STUDIO_PUBLIC_URL:-https://studio.indobase.in}" || true
  fi
  exec bench start
}

ensure_apps_and_site() {
  cd frappe-bench
  bench set-mariadb-host discuss-mariadb
  bench set-redis-cache-host redis://discuss-redis:6379
  bench set-redis-queue-host redis://discuss-redis:6379
  bench set-redis-socketio-host redis://discuss-redis:6379
  sed -i '/redis/d' ./Procfile || true
  sed -i '/watch/d' ./Procfile || true

  if [ ! -d "apps/${APP_REPO_NAME}/gameplan" ] \
    && [ ! -f "apps/${APP_REPO_NAME}/pyproject.toml" ] \
    && [ ! -f "apps/${APP_REPO_NAME}/setup.py" ]; then
    rm -rf "apps/${APP_REPO_NAME}"
  fi
  if [ ! -d "apps/${APP_REPO_NAME}" ]; then
    bench get-app "${APP_REPO_NAME}" "${APP_GIT_URL}" --branch "${APP_GIT_BRANCH}"
  else
    # Retry yarn if previous get-app timed out mid-install.
    (cd "apps/${APP_REPO_NAME}" && yarn install --check-files) || \
      bench get-app "${APP_REPO_NAME}" "${APP_GIT_URL}" --branch "${APP_GIT_BRANCH}" || true
  fi
  mkdir -p "apps/${INDOBASE_APP}"
  cp -a "${INDOBASE_SRC}/." "apps/${INDOBASE_APP}/"
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
  # Skip Frappe desk setup wizard for SSO operators.
  bench --site "${SITE}" set-config setup_complete 1 || true
  bench --site "${SITE}" clear-cache
  bench use "${SITE}"
  ensure_gameplan_frontend_built
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

echo "[${LABEL}] creating bench (Frappe ${FRAPPE_BRANCH})…"
bench init --skip-redis-config-generation --frappe-branch "${FRAPPE_BRANCH}" frappe-bench
ensure_apps_and_site
