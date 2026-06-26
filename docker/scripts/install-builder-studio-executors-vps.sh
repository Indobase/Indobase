#!/usr/bin/env bash
# One-shot: wire Studio ↔ Builder executors on the VPS (deployment + mobile build workers).
#
# Usage on VPS as root:
#   bash docker/scripts/install-builder-studio-executors-vps.sh
#
# Or from laptop:
#   VPS_SSH_KEY=~/.ssh/id_ed25519_indobase_vps bash docker/scripts/install-builder-studio-executors-vps.sh
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/etc/dokploy/compose/indobase-backend-bmqhan/code}"
COMPOSE_ENV="${COMPOSE_ENV:-$REPO_ROOT/docker/.env}"
BUILD_SCRIPT_SRC="$REPO_ROOT/docker/scripts/build-android-aab.sh"
BUILD_SCRIPT_DST="/opt/indobase/build-android-aab.sh"
MOBILE_BUILD_ENV="/etc/indobase/mobile-build.env"

ssh_remote() {
  local host="${VPS_SSH:-root@187.77.30.165}"
  local key="${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_indobase_vps}"
  ssh -i "$key" -o StrictHostKeyChecking=accept-new "$host" "$@"
}

if [[ "${1:-}" != "--local" ]] && [[ ! -f "$REPO_ROOT/docker/scripts/install-project-deployment-executor.sh" ]]; then
  echo "Running on VPS via SSH…"
  scp -i "${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_indobase_vps}" \
    "$0" \
    "${VPS_SSH:-root@187.77.30.165}:$REPO_ROOT/docker/scripts/install-builder-studio-executors-vps.sh"
  ssh_remote "REPO_ROOT=$REPO_ROOT bash $REPO_ROOT/docker/scripts/install-builder-studio-executors-vps.sh --local"
  exit 0
fi

if [[ ! -f "$COMPOSE_ENV" ]]; then
  echo "Missing $COMPOSE_ENV" >&2
  exit 1
fi

handoff_secret="$(grep -m1 '^BUILDER_HANDOFF_SECRET=' "$COMPOSE_ENV" | cut -d= -f2- | tr -d '\r' || true)"
if [[ -z "$handoff_secret" || ${#handoff_secret} -lt 32 ]]; then
  echo "BUILDER_HANDOFF_SECRET missing or too short in $COMPOSE_ENV" >&2
  exit 1
fi

find "$REPO_ROOT/docker/scripts" -name '*.sh' -exec sed -i 's/\r$//' {} +
chmod +x "$REPO_ROOT/docker/scripts/"*.sh

mkdir -p /opt/indobase /etc/indobase /var/lib/indobase/mobile-builds
chmod 755 /var/lib/indobase/mobile-builds
install -m 0755 "$BUILD_SCRIPT_SRC" "$BUILD_SCRIPT_DST"

if [[ ! -f "$MOBILE_BUILD_ENV" ]]; then
  cat >"$MOBILE_BUILD_ENV" <<'EOF'
# Optional: EAS_TOKEN or EXPO_TOKEN for Expo Android AAB builds.
# EAS_TOKEN=
EOF
  chmod 600 "$MOBILE_BUILD_ENV"
fi

DEPLOY_ENV="/etc/indobase/project-deployment-executor.env"
MOBILE_ENV="/etc/indobase/project-mobile-build-executor.env"

write_env_if_missing() {
  local file="$1"
  shift
  if [[ -f "$file" ]]; then
    return 0
  fi
  "$@" 
}

bash "$REPO_ROOT/docker/scripts/install-project-deployment-executor.sh"
bash "$REPO_ROOT/docker/scripts/install-project-mobile-build-executor.sh"

# Ensure runtime secrets and mobile command are set (idempotent).
for file in "$DEPLOY_ENV" "$MOBILE_ENV"; do
  grep -q '^PROJECT_.*_RUNTIME_SECRET=' "$file" || true
done

python3 - "$DEPLOY_ENV" "$MOBILE_ENV" "$handoff_secret" "$BUILD_SCRIPT_DST" <<'PY'
import pathlib, sys

deploy_env, mobile_env, secret, build_cmd = sys.argv[1:5]

def upsert(path: pathlib.Path, updates: dict[str, str]) -> None:
    lines = path.read_text().splitlines() if path.exists() else []
    keys = set(updates)
    out = []
    seen = set()
    for line in lines:
        key = line.split("=", 1)[0] if "=" in line and not line.strip().startswith("#") else None
        if key in keys:
            out.append(f"{key}={updates[key]}")
            seen.add(key)
        else:
            out.append(line)
    for key, value in updates.items():
        if key not in seen:
            out.append(f"{key}={value}")
    path.write_text("\n".join(out).rstrip() + "\n")

upsert(pathlib.Path(deploy_env), {
    "PROJECT_DEPLOYMENT_EXECUTOR_URL": "https://studio.indobase.in",
    "PROJECT_DEPLOYMENT_RUNTIME_SECRET": secret,
    "BUILDER_HANDOFF_SECRET": secret,
})
upsert(pathlib.Path(mobile_env), {
    "PROJECT_MOBILE_BUILD_EXECUTOR_URL": "https://studio.indobase.in",
    "PROJECT_MOBILE_BUILD_RUNTIME_SECRET": secret,
    "BUILDER_HANDOFF_SECRET": secret,
    "PROJECT_MOBILE_BUILD_EXECUTOR_COMMAND": build_cmd,
})
PY

systemctl restart indobase-project-deployment-executor.service
systemctl restart indobase-project-mobile-build-executor.service

echo "=== Executor smoke test ==="
/usr/local/bin/project-deployment-executor.sh --once || true
/usr/local/bin/project-mobile-build-executor.sh --once || true

systemctl --no-pager --full status indobase-project-deployment-executor.service | head -5
systemctl --no-pager --full status indobase-project-mobile-build-executor.service | head -5

echo "Done. Set EAS_TOKEN in $MOBILE_BUILD_ENV when Expo source is available on the VPS."
echo "Ensure Studio can write PROJECT_MOBILE_BUILD_SOURCE_ROOT (default /var/lib/indobase/mobile-builds), e.g. bind-mount it into the Studio container."
