# Indobase Design — single image: Vite-built SPA served by the Hono API.
#
# Unlike the Penpot fork this replaces (frontend + backend + exporter + valkey + its own postgres +
# an OIDC shim = 6 containers), this is ONE app container plus Postgres. The SSO shim is gone
# because the backend is ours and verifies the Studio handoff JWT directly.

# ── Build stage ─────────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-lock.yaml* .npmrc ./
RUN pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN pnpm run build

# ── Runtime stage ───────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-lock.yaml* .npmrc ./
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod --no-frozen-lockfile

# Server sources (run via tsx) + the built SPA it serves.
COPY src/server ./src/server
COPY --from=build /app/dist ./dist
RUN chown -R node:node /app

# Run unprivileged — the node image ships a `node` user.
USER node

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node_modules/.bin/tsx", "src/server/index.ts"]
