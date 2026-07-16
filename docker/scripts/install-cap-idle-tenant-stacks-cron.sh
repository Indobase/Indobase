#!/usr/bin/env bash
# Install a single flock-guarded cron entry for cap-idle-tenant-stacks on the VPS.
#
# Usage (on VPS as root):
#   bash docker/scripts/install-cap-idle-tenant-stacks-cron.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL_BIN="${INSTALL_BIN:-/usr/local/bin/indobase-cap-idle-tenant-stacks.sh}"
INSTALL_CRON="${INSTALL_CRON:-/usr/local/bin/indobase-cap-idle-tenant-stacks-cron.sh}"
CRON_FILE="/etc/cron.d/indobase-cap-idle-tenant-stacks"
MAX_RUNNING="${MAX_RUNNING_TENANT_STACKS:-12}"
ENV_FILE="${DOCKER_ENV_FILE:-/etc/dokploy/compose/indobase-backend-bmqhan/code/docker/.env}"

cp "${ROOT}/scripts/cap-idle-tenant-stacks.sh" "$INSTALL_BIN"
chmod +x "$INSTALL_BIN"

cat >"$INSTALL_CRON" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
ROOT="__INDOBASE_DOCKER_ROOT__"
ENV_FILE="__INDOBASE_ENV_FILE__"
MAX_RUNNING="__MAX_RUNNING__"
export DOCKER_ENV_FILE="$ENV_FILE"
export MAX_RUNNING_TENANT_STACKS="$MAX_RUNNING"
exec bash "${ROOT}/scripts/cap-idle-tenant-stacks-cron-vps.sh"
WRAPPER

sed -i "s|__INDOBASE_DOCKER_ROOT__|${ROOT}|g" "$INSTALL_CRON"
sed -i "s|__INDOBASE_ENV_FILE__|${ENV_FILE}|g" "$INSTALL_CRON"
sed -i "s|__MAX_RUNNING__|${MAX_RUNNING}|g" "$INSTALL_CRON"
chmod +x "$INSTALL_CRON"

cat >"$CRON_FILE" <<EOF
# Indobase: cap idle tenant stacks (flock inside cap-idle-tenant-stacks.sh)
*/5 * * * * root ${INSTALL_CRON} >> /var/log/indobase-cap-tenant-stacks.log 2>&1
EOF
chmod 644 "$CRON_FILE"

# Remove duplicate cap-idle lines from root crontab (legacy installs).
if crontab -l >/dev/null 2>&1; then
  crontab -l | grep -v 'cap-idle-tenant-stacks' | crontab - || true
fi

# Remove legacy per-minute root-crontab style entries from other cron.d files.
for legacy in /etc/cron.d/indobase-cap-stacks; do
  [[ -f "$legacy" ]] && rm -f "$legacy" && echo "Removed legacy $legacy"
done

echo "Installed ${INSTALL_BIN}, ${INSTALL_CRON}, and ${CRON_FILE} (every 5 min, max ${MAX_RUNNING} stacks)."
