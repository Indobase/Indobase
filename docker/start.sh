#!/bin/sh
set -e

# Single server: Next.js serves / (marketing from public/) and /dashboard (Studio)
export PORT="${PORT:-8080}"
NODE_BIN="$(command -v node)"

# Locate server.js (path varies: root in some setups, apps/studio/server.js in monorepo standalone)
SERVER_JS=""
if [ -f /srv/studio/server.js ]; then
  SERVER_JS=/srv/studio/server.js
elif [ -f /srv/studio/apps/studio/server.js ]; then
  SERVER_JS=/srv/studio/apps/studio/server.js
else
  SERVER_JS="$(find /srv/studio -name 'server.js' -type f 2>/dev/null | head -1)"
fi
if [ -z "$SERVER_JS" ] || [ ! -f "$SERVER_JS" ]; then
  echo "ERROR: Next.js server.js not found under /srv/studio. Contents:"
  find /srv/studio -type f -name '*.js' 2>/dev/null | head -20
  exit 1
fi

# Run Next.js (serves marketing at / and Studio at /dashboard)
exec "$NODE_BIN" "$SERVER_JS"

