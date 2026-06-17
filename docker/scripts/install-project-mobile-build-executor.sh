#!/usr/bin/env bash
# Install the project mobile build executor as a systemd service on the VPS.
# Run as root:
#   bash docker/scripts/install-project-mobile-build-executor.sh
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/etc/dokploy/compose/indobase-backend-bmqhan/code}"
EXECUTOR_SCRIPT="$REPO_ROOT/docker/scripts/project-mobile-build-executor.sh"
INSTALLED_SCRIPT="/usr/local/bin/project-mobile-build-executor.sh"
ENV_FILE="${PROJECT_MOBILE_BUILD_EXECUTOR_ENV_FILE:-/etc/indobase/project-mobile-build-executor.env}"
UNIT_NAME="indobase-project-mobile-build-executor.service"

if [[ ! -f "$EXECUTOR_SCRIPT" ]]; then
  echo "missing $EXECUTOR_SCRIPT" >&2
  exit 1
fi

install -m 0755 "$EXECUTOR_SCRIPT" "$INSTALLED_SCRIPT"
mkdir -p "$(dirname "$ENV_FILE")"

if [[ ! -f "$ENV_FILE" ]]; then
  cat >"$ENV_FILE" <<'EOF'
# Public Studio origin or private load balancer URL serving the Studio API.
PROJECT_MOBILE_BUILD_EXECUTOR_URL=https://studio.indobase.in

# Prefer a dedicated runtime secret. Falls back to BUILDER_HANDOFF_SECRET/AUTH_JWT_SECRET/JWT_SECRET if omitted.
PROJECT_MOBILE_BUILD_RUNTIME_SECRET=

# Stable worker identity shown in build metadata and logs.
PROJECT_MOBILE_BUILD_EXECUTOR_WORKER_ID=vps-project-mobile-build-executor

# Batch and polling controls.
PROJECT_MOBILE_BUILD_EXECUTOR_LIMIT=1
PROJECT_MOBILE_BUILD_EXECUTOR_INTERVAL_MS=10000
PROJECT_MOBILE_BUILD_EXECUTOR_IDLE_INTERVAL_MS=30000
PROJECT_MOBILE_BUILD_EXECUTOR_FAILURE_INTERVAL_MS=15000
PROJECT_MOBILE_BUILD_EXECUTOR_HEARTBEAT_INTERVAL_MS=45000
PROJECT_MOBILE_BUILD_EXECUTOR_TIMEOUT_SECONDS=60
PROJECT_MOBILE_BUILD_EXECUTOR_CONNECT_TIMEOUT_SECONDS=10

# Required. This command receives the claimed build payload through:
#   INDOBASE_MOBILE_BUILD_JSON_FILE
#   INDOBASE_MOBILE_BUILD_RESULT_FILE
#   INDOBASE_MOBILE_BUILD_LOG_FILE
#   INDOBASE_MOBILE_BUILD_ID
#   INDOBASE_MOBILE_BUILD_PROJECT_REF
#   INDOBASE_MOBILE_BUILD_WORKER_ID
# Example:
# PROJECT_MOBILE_BUILD_EXECUTOR_COMMAND=/opt/indobase/build-android-aab.sh
PROJECT_MOBILE_BUILD_EXECUTOR_COMMAND=
EOF
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE"
fi

cat >/etc/systemd/system/$UNIT_NAME <<EOF
[Unit]
Description=Indobase project mobile build executor
After=network-online.target docker.service
Wants=network-online.target docker.service

[Service]
Type=simple
Environment=PROJECT_MOBILE_BUILD_EXECUTOR_ENV_FILE=$ENV_FILE
ExecStart=$INSTALLED_SCRIPT --loop
Restart=always
RestartSec=10
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$UNIT_NAME"
systemctl restart "$UNIT_NAME"

echo "Installed $UNIT_NAME"
echo "Edit $ENV_FILE to set PROJECT_MOBILE_BUILD_RUNTIME_SECRET, PROJECT_MOBILE_BUILD_EXECUTOR_COMMAND, and the Studio URL if required."
echo "Check status with: systemctl status $UNIT_NAME"
