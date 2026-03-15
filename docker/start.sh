#!/bin/sh
set -e

# Start the Next.js (Studio) server on internal port
export PORT="${STUDIO_PORT:-8082}"
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

# Start Studio in background
"$NODE_BIN" "$SERVER_JS" &
STUDIO_PID=$!

# Start nginx in foreground
nginx -g 'daemon off;'

# In case nginx exits, also stop the background node process
kill $STUDIO_PID 2>/dev/null || true

