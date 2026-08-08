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
#   FORCE_RESTART=1  # always systemctl restart (default: soft-reload when already healthy)
#   Soft reload avoids ~2–4 min Builder outage (wrangler cold start) when only frontend rebrand changed.
set -euo pipefail

SSH_HOST="${VPS_SSH:-root@103.190.92.249}"
SSH_KEY="${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_indobase_vps}"
SSH_OPTS=(-4 -o ConnectTimeout=45 -i "$SSH_KEY")
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SKIP_INSTALL="${SKIP_INSTALL:-0}"
FORCE_RESTART="${FORCE_RESTART:-0}"

echo "==> Sync rebrand + seed scripts + Indobase formats to ${SSH_HOST}…"
ssh "${SSH_OPTS[@]}" "$SSH_HOST" "mkdir -p /opt/indobase-builder-cfos/scripts /opt/indobase-builder-cfos/branding/followups /opt/indobase-builder-cfos/formats"
scp "${SSH_OPTS[@]}" \
  "${REPO_ROOT}/indobase-builder-cfos/scripts/rebrand-cloudflare-os.mjs" \
  "${REPO_ROOT}/indobase-builder-cfos/scripts/seed-openrouter-models.mjs" \
  "${REPO_ROOT}/indobase-builder-cfos/scripts/seed-format-routing.mjs" \
  "${REPO_ROOT}/indobase-builder-cfos/scripts/fetch-cloudflare-os.sh" \
  "${REPO_ROOT}/indobase-builder-cfos/scripts/install-indobase-formats.sh" \
  "${SSH_HOST}:/opt/indobase-builder-cfos/scripts/"
scp "${SSH_OPTS[@]}" \
  "${REPO_ROOT}/indobase-builder-cfos/branding/favicon.svg" \
  "${REPO_ROOT}/indobase-builder-cfos/branding/IndobaseMark.tsx" \
  "${REPO_ROOT}/indobase-builder-cfos/branding/NOTICE" \
  "${REPO_ROOT}/indobase-builder-cfos/branding/indobase-mark.svg" \
  "${SSH_HOST}:/opt/indobase-builder-cfos/branding/"
scp "${SSH_OPTS[@]}" \
  "${REPO_ROOT}/indobase-builder-cfos/branding/followups/followups.ts" \
  "${REPO_ROOT}/indobase-builder-cfos/branding/followups/FollowUpRecommendations.tsx" \
  "${REPO_ROOT}/indobase-builder-cfos/branding/followups/FollowUpRecommendations.module.css" \
  "${SSH_HOST}:/opt/indobase-builder-cfos/branding/followups/"
# Formats tree (gadgets + Design source). Exclude AppleDouble junk.
rsync -az --delete \
  -e "ssh ${SSH_OPTS[*]}" \
  --exclude '._*' --exclude '.DS_Store' \
  "${REPO_ROOT}/indobase-builder-cfos/formats/" \
  "${SSH_HOST}:/opt/indobase-builder-cfos/formats/"

ssh "${SSH_OPTS[@]}" "$SSH_HOST" \
  "SKIP_INSTALL=${SKIP_INSTALL}" \
  "FORCE_RESTART=${FORCE_RESTART}" \
  bash -s <<'REMOTE'
set -euo pipefail
export CFOS_DIR="${CFOS_RUNTIME_DIR:-/opt/indobase-cfos-runtime/cloudflare-os}"
export ROOT_SCRIPTS=/opt/indobase-builder-cfos
SKIP_INSTALL="${SKIP_INSTALL:-0}"
FORCE_RESTART="${FORCE_RESTART:-0}"

wait_cfos_ready() {
  local label="${1:-CF OS}"
  echo "Waiting for ${label} on :8787 (HTTP + WebSocket /api)…"
  for i in $(seq 1 240); do
    if curl -sf -o /dev/null --connect-timeout 2 --max-time 30 http://127.0.0.1:8787/ 2>/dev/null; then
      # Exact /api upgrade is what the bridge proxies for Builder RPC.
      local ws_code
      ws_code="$(
        curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 2 --max-time 15 \
          -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
          -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
          http://127.0.0.1:8787/api 2>/dev/null || echo 000
      )"
      # 101 = ready; 400 = HTTP hit without completing upgrade still proves listener+handler.
      if [[ "$ws_code" == "101" || "$ws_code" == "400" ]]; then
        echo "Runtime is up (HTTP 200, /api → ${ws_code})."
        return 0
      fi
      echo "  (HTTP up; /api returned ${ws_code}, waiting… $i)"
    elif ss -lntp 2>/dev/null | grep -q ':8787'; then
      echo "  (listener up; still warming HTTP… $i)"
    fi
    if [[ "$i" -eq 240 ]]; then
      echo "::error::Timed out waiting for CF OS on :8787"
      journalctl -u indobase-cfos-runtime -n 120 --no-pager || true
      return 1
    fi
    sleep 5
  done
}

ensure_docker_host_8787() {
  # Swarm bridge reaches host via docker_gwbridge (172.18.0.1); INPUT policy is DROP.
  iptables -C INPUT -i docker_gwbridge -p tcp --dport 8787 -j ACCEPT 2>/dev/null \
    || iptables -I INPUT 1 -i docker_gwbridge -p tcp --dport 8787 -j ACCEPT
  iptables -C INPUT -i docker0 -p tcp --dport 8787 -j ACCEPT 2>/dev/null \
    || iptables -I INPUT 1 -i docker0 -p tcp --dport 8787 -j ACCEPT
}

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
CLOUDFLARE_OS_DIR="$CFOS_DIR" FORMAT_BLUEPRINTS_DIR="$ROOT_SCRIPTS/formats" \
  bash "$ROOT_SCRIPTS/scripts/install-indobase-formats.sh"

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

# Bridge URL + handoff secret so CFOS launchBusiness AgentTool can POST to Indobase OS.
BRIDGE_URL="${INDOBASE_BRIDGE_URL:-https://builder.indobase.in}"
OS_SECRET=""
if [[ -f /opt/indobase-builder-cfos.runtime.env ]]; then
  OS_SECRET="$(grep -E '^BUILDER_CFOS_HANDOFF_SECRET=' /opt/indobase-builder-cfos.runtime.env | head -1 | cut -d= -f2- || true)"
fi
if [[ -z "$OS_SECRET" && -f /opt/indobase/docker/.env ]]; then
  OS_SECRET="$(grep -E '^BUILDER_CFOS_HANDOFF_SECRET=' /opt/indobase/docker/.env | head -1 | cut -d= -f2- || true)"
fi
if [[ -z "$OS_SECRET" && -n "${BUILDER_CFOS_HANDOFF_SECRET:-}" ]]; then
  OS_SECRET="$BUILDER_CFOS_HANDOFF_SECRET"
fi
umask 077
touch "$CFOS_DIR/.dev.vars"
chmod 600 "$CFOS_DIR/.dev.vars"
python3 - <<PY
from pathlib import Path
p = Path("$CFOS_DIR") / ".dev.vars"
text = p.read_text() if p.exists() else ""
updates = {
  "INDOBASE_BRIDGE_URL": """$BRIDGE_URL""",
}
secret = """$OS_SECRET"""
if len(secret) >= 32:
  updates["INDOBASE_OS_SECRET"] = secret
lines = text.splitlines()
out = []
seen = set()
for line in lines:
  if not line.strip() or line.startswith("#") or "=" not in line:
    out.append(line)
    continue
  k = line.split("=", 1)[0]
  if k in updates:
    out.append(f"{k}={updates[k]}")
    seen.add(k)
  else:
    out.append(line)
for k, v in updates.items():
  if k not in seen:
    out.append(f"{k}={v}")
p.write_text("\\n".join(out) + "\\n")
print("Updated", p, "keys:", ", ".join(updates))
PY

PNPM_BIN="$(command -v pnpm)"
UNIT_PATH=/etc/systemd/system/indobase-cfos-runtime.service
UNIT_NEW="$(mktemp)"
cat > "$UNIT_NEW" <<UNIT
[Unit]
Description=Indobase Builder agent runtime (Cloudflare OS workerd)
After=network.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/indobase-cfos-runtime/cloudflare-os
Environment=NODE_ENV=production
# Temporary shared CFOS operator login so the agent desktop boots for every visitor.
# Multi-tenant isolation for Launch/Enable is enforced on the Indobase bridge/Studio APIs
# (guests cannot publish; subdomain ownership; plan gates). Per-session CFOS auth is Phase 2.
Environment=VITE_DEV_AUTO_LOGIN=true
Environment=VITE_DEV_USERNAME=dev
Environment=VITE_DEV_PASSWORD=devpassword
Environment=VITE_BACKEND_HOST=localhost:8787
Environment=INDOBASE_WRANGLER_IP=0.0.0.0
Environment=FORMAT_BLUEPRINTS_DIR=/opt/indobase-builder-cfos/formats
ExecStart=${PNPM_BIN} run-local
Restart=on-failure
RestartSec=8
MemoryMax=7G
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
UNIT

UNIT_CHANGED=0
if [[ ! -f "$UNIT_PATH" ]] || ! cmp -s "$UNIT_NEW" "$UNIT_PATH"; then
  install -m 644 "$UNIT_NEW" "$UNIT_PATH"
  UNIT_CHANGED=1
  echo "Updated systemd unit"
else
  echo "Systemd unit unchanged"
fi
rm -f "$UNIT_NEW"

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

ensure_docker_host_8787

# Pre-build workshop frontend WHILE the old runtime is still serving traffic when possible.
# Cold `pnpm run-local` otherwise spends 1–2+ minutes in vite before wrangler binds :8787.
echo "→ Pre-building workshop-frontend (shortens restart outage window)…"
cd "$CFOS_DIR/packages/workshop-frontend"
if [[ -f package.json ]]; then
  "$PNPM_BIN" exec vite build -c vite.config.ts \
    || echo "::warning::frontend pre-build failed; run-local will rebuild on start"
fi
cd "$CFOS_DIR"

systemctl daemon-reload
systemctl enable indobase-cfos-runtime.service

RUNTIME_HEALTHY=0
if systemctl is-active --quiet indobase-cfos-runtime.service \
  && curl -sf -o /dev/null --connect-timeout 2 --max-time 10 http://127.0.0.1:8787/ 2>/dev/null; then
  RUNTIME_HEALTHY=1
fi

if [[ "$FORCE_RESTART" == "1" || "$UNIT_CHANGED" == "1" || "$RUNTIME_HEALTHY" != "1" ]]; then
  echo "→ Full restart (FORCE_RESTART=${FORCE_RESTART} UNIT_CHANGED=${UNIT_CHANGED} HEALTHY=${RUNTIME_HEALTHY})…"
  systemctl restart indobase-cfos-runtime.service
  wait_cfos_ready "CF OS after restart" || exit 1
else
  echo "→ Soft reload: runtime already healthy; skipping systemctl restart (vite --watch picks up rebrand)."
  echo "   Set FORCE_RESTART=1 to force a cold start. Avoids ~2–4 min Builder WSS outage."
  # Give watch rebuild a moment; still assert readiness.
  sleep 3
  wait_cfos_ready "CF OS soft reload" || exit 1
fi
# Regression gate: frontend must never bake wss://0.0.0.0:8787 (INDOBASE_WRANGLER_IP is bind-only).
echo "→ Asserting workshop frontend does not bake 0.0.0.0 into WebSocket host…"
python3 - <<'PY'
from pathlib import Path
import re
import sys

roots = [
    Path("/opt/indobase-cfos-runtime/cloudflare-os/packages/workshop-frontend/dist"),
    Path("/opt/indobase-cfos-runtime/cloudflare-os/packages/workshop-frontend/src"),
]
js_files = []
for root in roots:
    if not root.exists():
        continue
    js_files.extend(root.rglob("*.js"))
    js_files.extend(root.rglob("*.tsx"))
    js_files.extend(root.rglob("*.ts"))

if not js_files:
    print("warn: no frontend assets found yet to assert (cold dist?)")
    sys.exit(0)

bad = []
for path in js_files:
    # Skip miniflare / unrelated trees if somehow included
    text = path.read_text(errors="replace")
    if "0.0.0.0:8787" in text and "startsWith(\"0.0.0.0\")" not in text and "startsWith('0.0.0.0')" not in text:
        # Allow comments / guards; fail on literal URL bake patterns
        if re.search(r'["\']0\.0\.0\.0:8787["\']', text) or re.search(r'wss://0\.0\.0\.0:8787', text):
            bad.append(str(path))

main = Path("/opt/indobase-cfos-runtime/cloudflare-os/packages/workshop-frontend/src/main.tsx")
if main.exists():
    src = main.read_text(errors="replace")
    if "return window.location.host" not in src or "0.0.0.0" not in src:
        print("::error::getBackendHost patch missing in main.tsx — re-run rebrand-cloudflare-os.mjs")
        sys.exit(1)

if bad:
    print("::error::Frontend still bakes 0.0.0.0:8787 into:", *bad, sep="\n  ")
    sys.exit(1)
print("OK: no baked wss://0.0.0.0:8787; getBackendHost uses window.location.host off-loopback")
PY

if [[ -n "$OPENROUTER_KEY" ]]; then
  echo "→ Seeding OpenRouter models…"
  cd /opt/indobase-builder-cfos
  OPEN_ROUTER_API_KEY="$OPENROUTER_KEY" CLOUDFLARE_OS_DIR="$CFOS_DIR" CLOUDFLARE_OS_URL=http://127.0.0.1:8787 \
    node scripts/seed-openrouter-models.mjs || echo "::warning::seed failed (runtime may still be warming)"
fi

echo "→ Seeding Design format routing (AdminConfig agentHints)…"
cd /opt/indobase-builder-cfos
CLOUDFLARE_OS_DIR="$CFOS_DIR" CLOUDFLARE_OS_URL=http://127.0.0.1:8787 \
  VITE_DEV_USERNAME=dev VITE_DEV_PASSWORD=devpassword \
  node scripts/seed-format-routing.mjs \
  || CLOUDFLARE_OS_DIR="$CFOS_DIR" CLOUDFLARE_OS_URL=http://127.0.0.1:8787 \
       VITE_DEV_USERNAME=admin VITE_DEV_PASSWORD=devpassword \
       node scripts/seed-format-routing.mjs \
  || echo "::warning::format-routing seed failed (runtime may still be warming; re-run seed-format-routing.mjs)"

curl -sS -o /dev/null -w "runtime_http:%{http_code}\n" http://127.0.0.1:8787/ || true
systemctl is-active indobase-cfos-runtime.service
ss -lntp | grep 8787 || true
echo "Done. Bridge should use CLOUDFLARE_OS_URL=http://172.18.0.1:8787 (docker_gwbridge; allow INPUT tcp/8787 from docker_gwbridge)."
REMOTE
