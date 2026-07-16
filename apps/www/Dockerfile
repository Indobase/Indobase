# Build from monorepo root:
#   docker build -f apps/www/Dockerfile -t roshanraghavander/indobase-website:latest .
FROM node:22-bookworm-slim AS builder
WORKDIR /repo/apps/www
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate
COPY apps/www/package.json apps/www/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY apps/www/ ./
# hooks.server.ts imports ../../../packages/common/studio-docs-path-map.json
COPY packages/common/studio-docs-path-map.json /repo/packages/common/studio-docs-path-map.json
RUN pnpm run postinstall && pnpm build && pnpm prune --prod

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /repo/apps/www/package.json ./package.json
COPY --from=builder /repo/apps/www/node_modules ./node_modules
COPY --from=builder /repo/apps/www/build ./build
EXPOSE 3000
CMD ["node", "build/index.js"]
