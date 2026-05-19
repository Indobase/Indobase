#!/usr/bin/env bash
# Install a systemd timer that normalizes tenant Traefik configs every 5 minutes.
# Run on the VPS as root:
#   bash docker/scripts/install-tenant-traefik-watchdog.sh
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/etc/dokploy/compose/indobase-backend-bmqhan/code}"
WATCHDOG="$REPO_ROOT/docker/scripts/tenant-traefik-watchdog.sh"

if [[ ! -f "$WATCHDOG" ]]; then
  echo "missing $WATCHDOG" >&2
  exit 1
fi

chmod +x "$WATCHDOG"

cat >/etc/systemd/system/indobase-tenant-traefik-watchdog.service <<EOF
[Unit]
Description=Indobase tenant Traefik routing normalize (stripPrefix)
After=docker.service

[Service]
Type=oneshot
Environment=REPO_ROOT=$REPO_ROOT
Environment=TRAEFIK_DYNAMIC_DIR=/etc/dokploy/traefik/dynamic
ExecStart=$WATCHDOG
EOF

cat >/etc/systemd/system/indobase-tenant-traefik-watchdog.timer <<'EOF'
[Unit]
Description=Run Indobase tenant Traefik watchdog every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=1min
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now indobase-tenant-traefik-watchdog.timer
systemctl start indobase-tenant-traefik-watchdog.service

echo "Installed indobase-tenant-traefik-watchdog.timer (every 5 min)"
