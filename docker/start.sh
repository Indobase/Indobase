#!/bin/sh
set -e

# Start the Next.js (Studio) server on internal port
export PORT="${STUDIO_PORT:-8082}"
NODE_BIN="$(command -v node)"

# Start Studio in background
"$NODE_BIN" /srv/studio/server.js &
STUDIO_PID=$!

# Start nginx in foreground
nginx -g 'daemon off;'

# In case nginx exits, also stop the background node process
kill $STUDIO_PID 2>/dev/null || true

