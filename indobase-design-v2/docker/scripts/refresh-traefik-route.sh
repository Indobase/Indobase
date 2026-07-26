#!/usr/bin/env bash
# Refresh Traefik file provider after design-app recreate (dokploy-network IPs drift).
set -euo pipefail
APP=${1:-indobase-design-v2-design-app-1}
IP=$(docker inspect -f '{{(index .NetworkSettings.Networks "dokploy-network").IPAddress}}' "$APP")
if [ -z "$IP" ]; then
  echo "no dokploy-network IP for $APP" >&2
  exit 1
fi
cat > /etc/dokploy/traefik/dynamic/indobase-design-v2.yml <<EOF
http:
  routers:
    indobase-design-v2:
      rule: Host(\`studio-design.indobase.fun\`)
      entryPoints:
        - websecure
      service: indobase-design-v2
      tls:
        certResolver: letsencrypt
  services:
    indobase-design-v2:
      loadBalancer:
        servers:
          - url: "http://${IP}:8080"
EOF
echo "traefik -> http://${IP}:8080"
curl -sk -m 5 "https://studio-design.indobase.fun/sso/health" || true
echo
