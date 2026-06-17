#!/usr/bin/env bash
# Install the project deployment executor as a systemd service on the VPS.
# Run as root:
#   bash docker/scripts/install-project-deployment-executor.sh
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/etc/dokploy/compose/indobase-backend-bmqhan/code}"
EXECUTOR_SCRIPT="$REPO_ROOT/docker/scripts/project-deployment-executor.sh"
INSTALLED_SCRIPT="/usr/local/bin/project-deployment-executor.sh"
ENV_FILE="${PROJECT_DEPLOYMENT_EXECUTOR_ENV_FILE:-/etc/indobase/project-deployment-executor.env}"
UNIT_NAME="indobase-project-deployment-executor.service"

if [[ ! -f "$EXECUTOR_SCRIPT" ]]; then
  echo "missing $EXECUTOR_SCRIPT" >&2
  exit 1
fi

install -m 0755 "$EXECUTOR_SCRIPT" "$INSTALLED_SCRIPT"
mkdir -p "$(dirname "$ENV_FILE")"

if [[ ! -f "$ENV_FILE" ]]; then
  cat >"$ENV_FILE" <<'EOF'
# Public Studio origin or private load balancer URL serving the Studio API.
PROJECT_DEPLOYMENT_EXECUTOR_URL=https://studio.indobase.in

# Prefer a dedicated runtime secret. Falls back to BUILDER_HANDOFF_SECRET/AUTH_JWT_SECRET/JWT_SECRET if omitted.
PROJECT_DEPLOYMENT_RUNTIME_SECRET=

# Stable worker identity shown in deployment metadata and logs.
PROJECT_DEPLOYMENT_EXECUTOR_WORKER_ID=vps-project-deployment-executor

# Batch and polling controls.
PROJECT_DEPLOYMENT_EXECUTOR_LIMIT=5
PROJECT_DEPLOYMENT_EXECUTOR_INTERVAL_MS=10000
PROJECT_DEPLOYMENT_EXECUTOR_IDLE_INTERVAL_MS=30000
PROJECT_DEPLOYMENT_EXECUTOR_FAILURE_INTERVAL_MS=15000
PROJECT_DEPLOYMENT_EXECUTOR_TIMEOUT_SECONDS=30
PROJECT_DEPLOYMENT_EXECUTOR_CONNECT_TIMEOUT_SECONDS=10
EOF
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE"
fi

cat >/etc/systemd/system/$UNIT_NAME <<EOF
[Unit]
Description=Indobase project deployment executor
After=network-online.target docker.service
Wants=network-online.target docker.service

[Service]
Type=simple
Environment=PROJECT_DEPLOYMENT_EXECUTOR_ENV_FILE=$ENV_FILE
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
echo "Edit $ENV_FILE to set PROJECT_DEPLOYMENT_RUNTIME_SECRET and the Studio URL if required."
echo "Check status with: systemctl status $UNIT_NAME"
