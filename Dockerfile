FROM node:22-bookworm-slim AS deps
WORKDIR /workspace
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate
# Workspace manifests
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
# Monorepo sources
COPY apps ./apps
COPY packages ./packages
COPY blocks ./blocks
# Install workspace deps once
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build marketing app (www) — assumed static output
FROM deps AS build-www
WORKDIR /workspace/apps/www
RUN pnpm run build

# Build Studio (Next.js) — standalone server, with marketing site merged into public
# packages/ui/build (themes + tw-extend/color.js) must be committed so Tailwind has full theme
FROM deps AS build-studio
WORKDIR /workspace/apps/studio
# Merge www (marketing) static output into Studio public so one app serves / and /dashboard
COPY --from=build-www /workspace/apps/www/build/client /tmp/www-client
RUN mkdir -p /tmp/studio-public && cp -r /workspace/apps/studio/public/. /tmp/studio-public/ && \
    cp -r /tmp/www-client/. /workspace/apps/studio/public/ && \
    cp -r /tmp/studio-public/. /workspace/apps/studio/public/
ARG NEXT_PUBLIC_BASE_PATH=/dashboard
ARG SKIP_ASSET_UPLOAD=1
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
ENV SKIP_ASSET_UPLOAD=${SKIP_ASSET_UPLOAD}
# Next.js build can be memory-heavy; increase Node heap if Docker has enough RAM
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN pnpm run build

# Final runtime: single Node server (Studio + marketing from public/)
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Self-hosted Studio: required env so APIs don't assert (override in Dokploy if using volumes)
ENV EDGE_FUNCTIONS_MANAGEMENT_FOLDER=/app/edge-functions
ENV SNIPPETS_MANAGEMENT_FOLDER=/app/snippets
RUN mkdir -p /app/edge-functions /app/snippets

# Copy Studio standalone (marketing is in public/, served at / via rewrites)
COPY --from=build-studio /workspace/apps/studio/.next/standalone /srv/studio
COPY --from=build-studio /workspace/apps/studio/.next/static /srv/studio/.next/static
COPY --from=build-studio /workspace/apps/studio/public /srv/studio/public
RUN mkdir -p /srv/studio/apps/studio/.next /srv/studio/apps/studio/public && \
    cp -a /srv/studio/.next/static /srv/studio/apps/studio/.next/ && \
    cp -a /srv/studio/public/. /srv/studio/apps/studio/public/

# Single entrypoint: run Next.js on 8080 (serves / = marketing, /dashboard = Studio)
COPY docker/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

EXPOSE 8080
CMD ["/usr/local/bin/start.sh"]

