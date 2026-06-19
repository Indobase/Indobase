FROM node:20-alpine

# site-hosting runs `docker compose` against the mounted host socket.
RUN apk add --no-cache docker-cli docker-cli-compose

WORKDIR /app
COPY provisioner/server.mjs /app/server.mjs
COPY provisioner/tenant-traefik.mjs /app/tenant-traefik.mjs
COPY provisioner/site-hosting.mjs /app/site-hosting.mjs
COPY provisioner/shared-gateway-routes.mjs /app/shared-gateway-routes.mjs
COPY tenants /mnt/tenants

EXPOSE 8787
ENV NODE_ENV=production

CMD ["node", "/app/server.mjs"]

