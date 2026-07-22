#!/usr/bin/env bash
# Reclaim disk on the Indobase control-plane VPS (.249) so Postgres / GoTrue /
# postgres-meta do not die with "No space left on device".
#
# When the root filesystem fills up, `indobase-db` cannot write postmaster.pid,
# Docker DNS for `db` fails, and GoTrue surfaces the user-facing error
# "Database error querying schema".
#
# Install on the VPS (as root):
#   cp docker/scripts/indobase-control-plane-disk-prune.sh /usr/local/bin/
#   chmod +x /usr/local/bin/indobase-control-plane-disk-prune.sh
#   cp docker/systemd/indobase-disk-prune.service /etc/systemd/system/
#   cp docker/systemd/indobase-disk-prune.timer /etc/systemd/system/
#   systemctl daemon-reload && systemctl enable --now indobase-disk-prune.timer
#
# Safe defaults: never prune volumes; only remove unused images / build cache /
# oversized container JSON logs / old journal archives. Images referenced by
# running containers or Swarm services are kept by `docker image prune -af`.

set -euo pipefail

THRESHOLD_PCT="${INDOBASE_DISK_PRUNE_THRESHOLD_PCT:-80}"
LOG_MAX_MB="${INDOBASE_DISK_CONTAINER_LOG_MAX_MB:-100}"
JOURNAL_MAX="${INDOBASE_DISK_JOURNAL_MAX:-200M}"
ROOT_MOUNT="${INDOBASE_DISK_ROOT_MOUNT:-/}"

usage_pct() {
  df -P "$ROOT_MOUNT" | awk 'NR==2 {gsub(/%/,"",$5); print $5}'
}

avail_human() {
  df -h "$ROOT_MOUNT" | awk 'NR==2 {print $4 " free (" $5 " used)"}'
}

pct="$(usage_pct)"
echo "[indobase-disk-prune] before: $(avail_human)"

# Always trim runaway container logs (cheap, prevents silent fill).
if command -v find >/dev/null 2>&1; then
  find /var/lib/docker/containers -name '*-json.log' -size "+${LOG_MAX_MB}M" \
    -print -exec truncate -s 0 {} \; 2>/dev/null || true
fi

# Always keep journal bounded.
if command -v journalctl >/dev/null 2>&1; then
  journalctl --vacuum-size="$JOURNAL_MAX" >/dev/null 2>&1 || true
fi

if [ "$pct" -lt "$THRESHOLD_PCT" ]; then
  echo "[indobase-disk-prune] usage ${pct}% < ${THRESHOLD_PCT}% — skip docker prune"
  echo "[indobase-disk-prune] after: $(avail_human)"
  exit 0
fi

echo "[indobase-disk-prune] usage ${pct}% >= ${THRESHOLD_PCT}% — pruning unused docker data"

if command -v docker >/dev/null 2>&1; then
  docker builder prune -af >/dev/null 2>&1 || true
  # Dangling first, then unused images (keeps images used by containers/services).
  docker image prune -f >/dev/null 2>&1 || true
  docker image prune -af >/dev/null 2>&1 || true
fi

pct_after="$(usage_pct)"
echo "[indobase-disk-prune] after: $(avail_human)"

if [ "$pct_after" -ge 95 ]; then
  echo "[indobase-disk-prune] CRITICAL: disk still ${pct_after}% after prune" >&2
  exit 1
fi

if [ "$pct_after" -ge "$THRESHOLD_PCT" ]; then
  echo "[indobase-disk-prune] WARN: disk still ${pct_after}% after prune" >&2
fi
