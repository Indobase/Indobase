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

# Build Studio (Next.js) — standalone server
FROM deps AS build-studio
WORKDIR /workspace
# Ensure ui theme CSS and tw-extend exist when not in repo (e.g. CI clone)
RUN mkdir -p packages/ui/build/css/themes packages/ui/build/css/tw-extend
RUN echo '/* theme placeholder */' > packages/ui/build/css/themes/dark.css
RUN echo '/* theme placeholder */' > packages/ui/build/css/themes/light.css
RUN echo "module.exports = { 'colors-default': { cssVariable: '0 0% 50%' } }" > packages/ui/build/css/tw-extend/color.js
WORKDIR /workspace/apps/studio
ARG NEXT_PUBLIC_BASE_PATH=/dashboard
ARG SKIP_ASSET_UPLOAD=1
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
ENV SKIP_ASSET_UPLOAD=${SKIP_ASSET_UPLOAD}
# Next.js build can be memory-heavy; increase Node heap if Docker has enough RAM
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN pnpm run build

# Final runtime: Node + Nginx to serve static www and proxy /dashboard to Studio
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV STUDIO_PORT=8082

# Install nginx
RUN apk add --no-cache nginx && \
    mkdir -p /run/nginx /var/cache/nginx

# Copy Studio standalone server and assets
COPY --from=build-studio /workspace/apps/studio/.next/standalone /srv/studio
COPY --from=build-studio /workspace/apps/studio/.next/static /srv/studio/.next/static
COPY --from=build-studio /workspace/apps/studio/public /srv/studio/public

# Copy marketing static site output
COPY --from=build-www /workspace/apps/www/build /usr/share/nginx/html

# Nginx configuration and startup script
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

EXPOSE 8080
CMD ["/usr/local/bin/start.sh"]

