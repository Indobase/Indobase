#!/usr/bin/env bash
# Watchdog: if CFOS :8787 is down or hung, bounce wrangler (in-process loop)
# without a full systemd cold start. Safe to run every 30s from systemd timer.
set -euo pipefail

PORT="${INDOBASE_CFOS_PORT:-8787}"
FAIL_FILE="${INDOBASE_CFOS_WATCHDOG_STATE:-/run/indobase-cfos-watchdog.fails}"
MAX_FAILS="${INDOBASE_CFOS_WATCHDOG_MAX_FAILS:-2}"

healthy=0
if curl -sf -o /dev/null --connect-timeout 2 --max-time 8 "http://127.0.0.1:${PORT}/"; then
  healthy=1
fi

if [[ "$healthy" -eq 1 ]]; then
  rm -f "$FAIL_FILE"
  exit 0
fi

fails=0
if [[ -f "$FAIL_FILE" ]]; then
  fails="$(cat "$FAIL_FILE" 2>/dev/null || echo 0)"
fi
fails=$((fails + 1))
echo "$fails" >"$FAIL_FILE"

if [[ "$fails" -lt "$MAX_FAILS" ]]; then
  echo "indobase-cfos-watchdog: :${PORT} unhealthy (fail ${fails}/${MAX_FAILS})"
  exit 0
fi

echo "indobase-cfos-watchdog: :${PORT} unhealthy for ${fails} checks — bouncing wrangler"

# Prefer wrangler node parent of the listener; fallback systemctl restart.
listener_pid="$(ss -lntp 2>/dev/null | grep ":${PORT}" | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1 || true)"
target=""
if [[ -n "${listener_pid}" ]]; then
  p="$listener_pid"
  for _ in 1 2 3 4 5 6 7 8; do
    cmd="$(ps -o args= -p "$p" 2>/dev/null || true)"
    case "$cmd" in
      *wrangler*) target="$p"; break ;;
    esac
    p="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ' || true)"
    [[ -z "$p" || "$p" = "1" ]] && break
  done
fi

if [[ -n "$target" ]]; then
  echo "indobase-cfos-watchdog: SIGTERM wrangler pid=$target"
  kill -TERM "$target" || true
else
  echo "indobase-cfos-watchdog: no wrangler pid — systemctl restart indobase-cfos-runtime"
  systemctl restart indobase-cfos-runtime.service || true
fi

rm -f "$FAIL_FILE"
exit 0
