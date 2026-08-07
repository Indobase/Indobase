#!/usr/bin/env bash
# Provision Cloudflare OS agent runtime on Vyom .249 (host systemd, port 8787).
# Bridge reaches it via host.docker.internal:8787 (same-origin proxy for browsers).
#
# Usage (from laptop):
#   ./docker/scripts/provision-cfos-runtime-on-vps.sh
#
# Optional:
#   CFOS_RUNTIME_DIR=/opt/indobase-cfos-runtime/cloudflare-os
#   SKIP_INSTALL=1   # only (re)start systemd after sources exist
set -euo pipefail

SSH_HOST="${VPS_SSH:-root@103.190.92.249}"
SSH_KEY="${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_indobase_vps}"
SSH_OPTS=(-4 -o ConnectTimeout=45 -i "$SSH_KEY")
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SKIP_INSTALL="${SKIP_INSTALL:-0}"

echo "==> Sync rebrand + seed scripts + Indobase formats to ${SSH_HOST}…"
ssh "${SSH_OPTS[@]}" "$SSH_HOST" "mkdir -p /opt/indobase-builder-cfos/scripts /opt/indobase-builder-cfos/branding /opt/indobase-builder-cfos/formats"
scp "${SSH_OPTS[@]}" \
  "${REPO_ROOT}/indobase-builder-cfos/scripts/rebrand-cloudflare-os.mjs" \
  "${REPO_ROOT}/indobase-builder-cfos/scripts/seed-openrouter-models.mjs" \
  "${REPO_ROOT}/indobase-builder-cfos/scripts/fetch-cloudflare-os.sh" \
  "${REPO_ROOT}/indobase-builder-cfos/scripts/install-indobase-formats.sh" \
  "${SSH_HOST}:/opt/indobase-builder-cfos/scripts/"
scp "${SSH_OPTS[@]}" \
  "${REPO_ROOT}/indobase-builder-cfos/branding/favicon.svg" \
  "${REPO_ROOT}/indobase-builder-cfos/branding/IndobaseMark.tsx" \
  "${REPO_ROOT}/indobase-builder-cfos/branding/NOTICE" \
  "${REPO_ROOT}/indobase-builder-cfos/branding/indobase-mark.svg" \
  "${SSH_HOST}:/opt/indobase-builder-cfos/branding/"
# Formats tree (gadgets + Design source). Exclude AppleDouble junk.
rsync -az --delete \
  -e "ssh ${SSH_OPTS[*]}" \
  --exclude '._*' --exclude '.DS_Store' \
  "${REPO_ROOT}/indobase-builder-cfos/formats/" \
  "${SSH_HOST}:/opt/indobase-builder-cfos/formats/"

ssh "${SSH_OPTS[@]}" "$SSH_HOST" \
  "SKIP_INSTALL=${SKIP_INSTALL}" \
  bash -s <<'REMOTE'
set -euo pipefail
export CFOS_DIR="${CFOS_RUNTIME_DIR:-/opt/indobase-cfos-runtime/cloudflare-os}"
export ROOT_SCRIPTS=/opt/indobase-builder-cfos
SKIP_INSTALL="${SKIP_INSTALL:-0}"

corepack enable >/dev/null 2>&1 || true
command -v pnpm >/dev/null || corepack prepare pnpm@10.12.1 --activate
command -v node >/dev/null

if [[ ! -d "$CFOS_DIR/.git" ]]; then
  mkdir -p "$(dirname "$CFOS_DIR")"
  git clone --depth 1 https://github.com/cloudflare/cloudflare-os.git "$CFOS_DIR"
fi

find "$CFOS_DIR" -name '._*' -delete 2>/dev/null || true

if [[ "$SKIP_INSTALL" != "1" ]]; then
  echo "→ pnpm install (this can take a while)…"
  cd "$CFOS_DIR"
  pnpm install --frozen-lockfile || pnpm install
fi

echo "→ Indobase rebrand + formats + local auto-login bake…"
cd "$CFOS_DIR"
CLOUDFLARE_OS_DIR="$CFOS_DIR" FORMAT_BLUEPRINTS_DIR="$ROOT_SCRIPTS/formats" \
  node "$ROOT_SCRIPTS/scripts/rebrand-cloudflare-os.mjs"
bash "$ROOT_SCRIPTS/scripts/install-indobase-formats.sh" || true

OPENROUTER_KEY=""
if [[ -f /opt/indobase-builder.runtime.env ]]; then
  OPENROUTER_KEY="$(grep -E '^OPEN_ROUTER_API_KEY=' /opt/indobase-builder.runtime.env | head -1 | cut -d= -f2- || true)"
fi
if [[ -n "$OPENROUTER_KEY" ]]; then
  umask 077
  printf '%s\n' \
    '# Seeded from classic Builder — do not commit' \
    "OPEN_ROUTER_API_KEY=${OPENROUTER_KEY}" \
    > "$CFOS_DIR/.dev.vars"
  echo "Wrote $CFOS_DIR/.dev.vars (OpenRouter)"
fi

PNPM_BIN="$(command -v pnpm)"
cat > /etc/systemd/system/indobase-cfos-runtime.service <<UNIT
[Unit]
Description=Indobase Builder agent runtime (Cloudflare OS workerd)
After=network.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/indobase-cfos-runtime/cloudflare-os
Environment=NODE_ENV=development
Environment=VITE_DEV_AUTO_LOGIN=true
Environment=VITE_DEV_USERNAME=dev
Environment=VITE_DEV_PASSWORD=devpassword
Environment=VITE_BACKEND_HOST=0.0.0.0:8787
Environment=INDOBASE_WRANGLER_IP=0.0.0.0
Environment=FORMAT_BLUEPRINTS_DIR=/opt/indobase-builder-cfos/formats
ExecStart=${PNPM_BIN} run-local
Restart=on-failure
RestartSec=8
MemoryMax=4G
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
UNIT

# Bind wrangler on 0.0.0.0 so Docker host-gateway can reach :8787
python3 - <<'PY'
from pathlib import Path
p = Path("/opt/indobase-cfos-runtime/cloudflare-os/run-dev-server.js")
text = p.read_text()
if "INDOBASE_WRANGLER_IP" in text:
    print("run-dev-server.js already patched")
else:
    marker = 'console.log(`\\nStarting: wrangler dev ${args.join(" ")}\\n`);'
    insert = (
        'if (process.env.INDOBASE_WRANGLER_IP) {\n'
        '  args.push("--ip", process.env.INDOBASE_WRANGLER_IP);\n'
        '}\n'
        + marker
    )
    if marker not in text:
        raise SystemExit("run-dev-server.js: wrangler start log line not found")
    p.write_text(text.replace(marker, insert, 1))
    print("Patched run-dev-server.js for INDOBASE_WRANGLER_IP")
PY

systemctl daemon-reload
systemctl enable indobase-cfos-runtime.service
systemctl restart indobase-cfos-runtime.service

echo "Waiting for :8787…"
for i in $(seq 1 120); do
  if curl -sf -o /dev/null http://127.0.0.1:8787/ 2>/dev/null; then
    echo "Runtime is up."
    break
  fi
  if [[ "$i" -eq 120 ]]; then
    echo "::error::Timed out waiting for CF OS on :8787"
    journalctl -u indobase-cfos-runtime -n 120 --no-pager || true
    exit 1
  fi
  sleep 5
done

if [[ -n "$OPENROUTER_KEY" ]]; then
  echo "→ Seeding OpenRouter models…"
  cd /opt/indobase-builder-cfos
  OPEN_ROUTER_API_KEY="$OPENROUTER_KEY" CLOUDFLARE_OS_DIR="$CFOS_DIR" CLOUDFLARE_OS_URL=http://127.0.0.1:8787 \
    node scripts/seed-openrouter-models.mjs || echo "::warning::seed failed (runtime may still be warming)"
fi

curl -sS -o /dev/null -w "runtime_http:%{http_code}\n" http://127.0.0.1:8787/ || true
systemctl is-active indobase-cfos-runtime.service
ss -lntp | grep 8787 || true
echo "Done. Bridge should use CLOUDFLARE_OS_URL=http://172.18.0.1:8787 (docker_gwbridge; allow INPUT tcp/8787 from docker_gwbridge)."
REMOTE
