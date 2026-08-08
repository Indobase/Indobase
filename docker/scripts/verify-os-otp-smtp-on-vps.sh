#!/usr/bin/env bash
# verify-os-otp-smtp-on-vps.sh — report (default) or optionally apply OS OTP SMTP on control-plane .249
#
# Checks whether control-plane GoTrue / auth can deliver OS identity OTP mail
# (not fake_mail_password; Resend or real SMTP present). Does not change prod
# unless --apply is passed AND fake credentials are detected with a safe source
# in /etc/indobase/smtp.env.
#
# Usage (from laptop with VPS key):
#   bash docker/scripts/verify-os-otp-smtp-on-vps.sh           # report-only (default)
#   bash docker/scripts/verify-os-otp-smtp-on-vps.sh --fix    # same
#   bash docker/scripts/verify-os-otp-smtp-on-vps.sh --apply   # only if fake + smtp.env has Resend/SMTP
#
# Env overrides:
#   VPS_SSH=root@103.190.92.249
#   VPS_SSH_KEY=~/.ssh/id_ed25519_indobase_vps
#   STUDIO_HEALTH_URL=https://studio.indobase.in/api/health/live
#
# Findings (2026-08-08 report-only on root@103.190.92.249):
# - Studio health live: HTTP 200, version f5ae3a31e7be83a219c7c2a633202cb7685288d3
# - /etc/indobase/smtp.env: SMTP_HOST=indobase-smtp-relay; SMTP_USER/PASS EMPTY; RESEND_API_KEY missing
# - /opt/indobase/docker/.env: SMTP_PASS EMPTY
# - Container indobase-auth: GOTRUE_SMTP_PASS EMPTY → OS OTP emails will NOT deliver
# - --apply skipped: no safe Resend/real SMTP in smtp.env (empty pass is not apply-safe)
# Also mirrored in docs/BUILDER-GEN3-STATUS.md Remaining → Prod OTP email ops verify.
#
set -euo pipefail

MODE=fix
for arg in "$@"; do
  case "$arg" in
    --apply) MODE=apply ;;
    --fix) MODE=fix ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
  esac
done

VPS_SSH="${VPS_SSH:-root@103.190.92.249}"
VPS_SSH_KEY="${VPS_SSH_KEY:-$HOME/.ssh/id_ed25519_indobase_vps}"
STUDIO_HEALTH_URL="${STUDIO_HEALTH_URL:-https://studio.indobase.in/api/health/live}"
SSH_OPTS=(-4 -o ConnectTimeout=45 -o StrictHostKeyChecking=accept-new -i "$VPS_SSH_KEY")

if [[ ! -f "$VPS_SSH_KEY" ]]; then
  echo "FAIL: SSH key not found at $VPS_SSH_KEY" >&2
  exit 1
fi

echo "== OS OTP SMTP verify ($MODE) on $VPS_SSH =="
echo ""

# Optional laptop-side Studio health (does not require SSH).
if command -v curl >/dev/null 2>&1; then
  health_code=$(curl -sS -o /tmp/indobase-studio-health.json -w "%{http_code}" --connect-timeout 8 \
    "$STUDIO_HEALTH_URL" 2>/dev/null || echo "000")
  echo "Studio health ($STUDIO_HEALTH_URL): HTTP $health_code"
  if [[ "$health_code" == "200" && -f /tmp/indobase-studio-health.json ]]; then
    python3 - <<'PY' 2>/dev/null || true
import json
try:
    d=json.load(open("/tmp/indobase-studio-health.json"))
    print("  version:", d.get("version") or d.get("gitSha") or d.get("sha") or "(none)")
except Exception as e:
    print("  (could not parse health JSON)", e)
PY
  fi
  echo ""
fi

REMOTE_MODE="$MODE"
ssh "${SSH_OPTS[@]}" "$VPS_SSH" "MODE='$REMOTE_MODE' bash -s" <<'REMOTE'
set -euo pipefail

SECRETS="${INDOBASE_SMTP_SECRETS:-/etc/indobase/smtp.env}"
DOCKER_ENV_CANDIDATES=(
  /opt/indobase/docker/.env
  /etc/dokploy/compose/indobase-backend-bmqhan/code/docker/.env
)

echo "-- Control-plane secrets / .env --"
if [[ -f "$SECRETS" ]]; then
  echo "OK: $SECRETS exists"
  # Report presence only — never print secret values.
  for k in RESEND_API_KEY SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_ADMIN_EMAIL; do
    if grep -q "^${k}=" "$SECRETS" 2>/dev/null; then
      val=$(grep -m1 "^${k}=" "$SECRETS" | cut -d= -f2- | tr -d '\r')
      if [[ "$k" == "SMTP_PASS" || "$k" == "RESEND_API_KEY" ]]; then
        if [[ -z "$val" ]]; then
          echo "  $k: EMPTY"
        elif [[ "$val" == "fake_mail_password" ]]; then
          echo "  $k: FAKE (fake_mail_password)"
        else
          echo "  $k: set (len=${#val})"
        fi
      else
        echo "  $k: ${val:-EMPTY}"
      fi
    else
      echo "  $k: missing"
    fi
  done
else
  echo "WARN: $SECRETS missing"
fi

ENV_FILE=""
for f in "${DOCKER_ENV_CANDIDATES[@]}"; do
  if [[ -f "$f" ]]; then
    ENV_FILE="$f"
    break
  fi
done
if [[ -n "$ENV_FILE" ]]; then
  echo "OK: docker .env → $ENV_FILE"
  for k in SMTP_HOST SMTP_PASS RESEND_API_KEY GOTRUE_SMTP_PASS; do
    if grep -q "^${k}=" "$ENV_FILE" 2>/dev/null; then
      val=$(grep -m1 "^${k}=" "$ENV_FILE" | cut -d= -f2- | tr -d '\r')
      if [[ "$k" == *PASS* || "$k" == RESEND_API_KEY ]]; then
        if [[ "$val" == "fake_mail_password" ]]; then
          echo "  $k: FAKE"
        elif [[ -z "$val" ]]; then
          echo "  $k: EMPTY"
        else
          echo "  $k: set (len=${#val})"
        fi
      else
        echo "  $k: ${val:-EMPTY}"
      fi
    fi
  done
else
  echo "WARN: no docker .env found in known paths"
fi

echo ""
echo "-- Auth / GoTrue container SMTP env --"
# Prefer Swarm service tasks, then compose containers matching auth/gotrue.
mapfile -t AUTH_CIDS < <(
  docker ps --format '{{.ID}} {{.Names}}' 2>/dev/null \
    | grep -Ei 'auth|gotrue' \
    | grep -Eiv 'tenant-|indobase-tenant' \
    | awk '{print $1}' \
    || true
)

if [[ ${#AUTH_CIDS[@]} -eq 0 ]]; then
  echo "WARN: no control-plane auth/gotrue container found via docker ps"
else
  for cid in "${AUTH_CIDS[@]}"; do
    name=$(docker inspect -f '{{.Name}}' "$cid" 2>/dev/null | sed 's#^/##')
    echo "Container: $name ($cid)"
    env_dump=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$cid" 2>/dev/null || true)
    for k in GOTRUE_SMTP_HOST GOTRUE_SMTP_PORT GOTRUE_SMTP_USER GOTRUE_SMTP_PASS GOTRUE_SMTP_ADMIN_EMAIL GOTRUE_SMTP_SENDER_NAME GOTRUE_MAILER_AUTOCONFIRM; do
      line=$(printf '%s\n' "$env_dump" | grep -m1 "^${k}=" || true)
      if [[ -z "$line" ]]; then
        echo "  $k: missing"
        continue
      fi
      val="${line#*=}"
      if [[ "$k" == "GOTRUE_SMTP_PASS" ]]; then
        if [[ "$val" == "fake_mail_password" ]]; then
          echo "  $k: FAKE (fake_mail_password) ← OTP mail will NOT deliver"
        elif [[ -z "$val" ]]; then
          echo "  $k: EMPTY ← OTP mail will NOT deliver"
        else
          echo "  $k: set (len=${#val})"
        fi
      else
        echo "  $k: ${val}"
      fi
    done
  done
fi

echo ""
echo "-- Verdict --"
FAKE=0
HAS_REAL=0
if [[ -f "$SECRETS" ]]; then
  rp=$(grep -m1 '^RESEND_API_KEY=' "$SECRETS" 2>/dev/null | cut -d= -f2- | tr -d '\r' || true)
  sp=$(grep -m1 '^SMTP_PASS=' "$SECRETS" 2>/dev/null | cut -d= -f2- | tr -d '\r' || true)
  if [[ -n "$rp" && "$rp" != "fake_mail_password" ]]; then HAS_REAL=1; fi
  if [[ -n "$sp" && "$sp" != "fake_mail_password" ]]; then HAS_REAL=1; fi
fi
for cid in "${AUTH_CIDS[@]:-}"; do
  [[ -z "${cid:-}" ]] && continue
  pass=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$cid" 2>/dev/null \
    | grep -m1 '^GOTRUE_SMTP_PASS=' | cut -d= -f2- || true)
  if [[ "$pass" == "fake_mail_password" || -z "$pass" ]]; then
    FAKE=1
  fi
done

if [[ "$FAKE" -eq 1 ]]; then
  echo "FAIL: control-plane auth SMTP looks fake or empty — OS OTP emails will not arrive."
elif [[ "$HAS_REAL" -eq 1 ]]; then
  echo "OK: secrets look real; auth container pass is not fake_mail_password (spot-check above)."
else
  echo "WARN: could not confirm Resend/SMTP in $SECRETS — review auth container dump above."
fi

if [[ "${MODE}" == "apply" ]]; then
  echo ""
  echo "-- Apply mode --"
  if [[ "$FAKE" -ne 1 ]]; then
    echo "Skip apply: auth SMTP does not look fake/empty."
    exit 0
  fi
  if [[ "$HAS_REAL" -ne 1 ]]; then
    echo "Skip apply: no safe Resend/SMTP in $SECRETS. Create it first, then re-run --apply." >&2
    exit 2
  fi
  APPLY_SCRIPT=""
  for cand in \
    /opt/indobase/ind-repo/docker/scripts/configure-production-smtp-on-vps.sh \
    /opt/indobase/docker/scripts/configure-production-smtp-on-vps.sh \
    /root/ind-repo/docker/scripts/configure-production-smtp-on-vps.sh; do
    if [[ -f "$cand" ]]; then
      APPLY_SCRIPT="$cand"
      break
    fi
  done
  if [[ -z "$APPLY_SCRIPT" ]]; then
    echo "Skip apply: configure-production-smtp-on-vps.sh not found on host." >&2
    echo "Run that script from the deploy checkout after confirming smtp.env." >&2
    exit 2
  fi
  echo "Running $APPLY_SCRIPT (uses $SECRETS)…"
  bash "$APPLY_SCRIPT"
else
  echo ""
  echo "Report-only. To apply only when fake + smtp.env is ready:"
  echo "  bash docker/scripts/verify-os-otp-smtp-on-vps.sh --apply"
fi
REMOTE

echo ""
echo "Done ($MODE)."

# --- Ops findings (2026-08-08 report-only) ---
# Studio /api/health/live: 200 (version f5ae3a31…)
# smtp.env + docker .env: SMTP_PASS empty; RESEND_API_KEY missing; host=indobase-smtp-relay
# indobase-auth GOTRUE_SMTP_PASS empty → OTP mail will not deliver until real SMTP/Resend is set
# --apply not safe yet (no credentials in smtp.env)