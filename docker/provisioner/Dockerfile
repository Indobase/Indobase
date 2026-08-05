FROM node:20-alpine

# site-hosting runs `docker compose` against the mounted host socket.
RUN apk add --no-cache docker-cli docker-cli-compose

WORKDIR /app
COPY provisioner/package.json ./
RUN npm install --omit=dev
COPY provisioner/server.mjs /app/server.mjs
COPY provisioner/sentry.mjs /app/sentry.mjs
COPY provisioner/tenant-traefik.mjs /app/tenant-traefik.mjs
COPY provisioner/site-hosting.mjs /app/site-hosting.mjs
COPY provisioner/shared-gateway-routes.mjs /app/shared-gateway-routes.mjs
COPY provisioner/site-routes.mjs /app/site-routes.mjs
COPY provisioner/site-static-proxy.mjs /app/site-static-proxy.mjs
COPY tenants /mnt/tenants

EXPOSE 8787 8790
ENV NODE_ENV=production

CMD ["node", "/app/server.mjs"]
