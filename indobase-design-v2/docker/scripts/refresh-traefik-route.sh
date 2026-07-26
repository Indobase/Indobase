#!/usr/bin/env bash
# Refresh Traefik file provider for Indobase Design after design-app recreate.
# Uses container DNS (not overlay IP) so routes survive container IP churn.
set -euo pipefail
APP=${1:-indobase-design-v2-design-app-1}

if ! docker inspect "$APP" >/dev/null 2>&1; then
  echo "container not found: $APP" >&2
  exit 1
fi

# Ensure the app is on dokploy-network (Traefik's network) so container DNS resolves.
NET=$(docker inspect -f '{{index .NetworkSettings.Networks "dokploy-network"}}' "$APP" 2>/dev/null || true)
if [ -z "$NET" ] || [ "$NET" = "<no value>" ]; then
  echo "warn: $APP not on dokploy-network — attaching" >&2
  docker network connect dokploy-network "$APP" || true
fi

cat > /etc/dokploy/traefik/dynamic/indobase-design-v2.yml <<'EOF'
http:
  routers:
    indobase-design-v2:
      rule: Host(`design.indobase.in`) || Host(`design.indobase.fun`) || Host(`studio-design.indobase.fun`)
      entryPoints:
        - websecure
      service: indobase-design-v2
      tls:
        certResolver: letsencrypt
      priority: 20
  services:
    indobase-design-v2:
      loadBalancer:
        servers:
          - url: "http://indobase-design-v2-design-app-1:8080"
        passHostHeader: true
EOF

echo "traefik -> http://${APP}:8080 (container DNS)"
for host in design.indobase.in design.indobase.fun studio-design.indobase.fun; do
  echo -n "$host /sso/health: "
  curl -sk -m 5 "https://${host}/sso/health" || echo "fail"
  echo
done
