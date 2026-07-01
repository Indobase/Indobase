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
RUN pnpm install --frozen-lockfile --ignore-scripts && \
  find /workspace -path '*/@indobaseinc/mcp-server/dist/chunk-WJNHYGQT.js' -exec \
    sed -i 's/"@indobaseinc\/mcp-utils":""\^0.3.2""/"@indobaseinc\/mcp-utils":"^0.3.2"/g' {} + && \
  find /workspace -path '*/@indobaseinc/mcp-server/dist/chunk-A5V4CFB4.cjs' -exec \
    sed -i 's/"@indobaseinc\/mcp-utils":""\^0.3.2""/"@indobaseinc\/mcp-utils":"^0.3.2"/g' {} + 2>/dev/null || true

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
ARG NEXT_PUBLIC_BASE_PATH=
ARG SKIP_ASSET_UPLOAD=1
ARG NEXT_PUBLIC_INDOBASE_SAAS=true
ARG NEXT_PUBLIC_API_URL=https://api.indobase.in
ARG NEXT_PUBLIC_GOTRUE_URL=https://api.indobase.in/auth/v1
ARG NEXT_PUBLIC_SITE_URL=https://studio.indobase.in
ARG NEXT_PUBLIC_SUPABASE_URL=https://api.indobase.in
ARG NEXT_PUBLIC_ANON_KEY=
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=
ARG NEXT_PUBLIC_GITHUB_INTEGRATION_CLIENT_ID=
ARG NEXT_PUBLIC_GITHUB_INTEGRATION_APP_NAME=indobase-studio
ARG NEXT_PUBLIC_VERCEL_INTEGRATION_URL=
ARG NEXT_PUBLIC_RAZORPAY_BILLING=
ARG NEXT_PUBLIC_RAZORPAY_KEY_ID=
ARG NEXT_PUBLIC_POSTHOG_KEY=
ARG NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
ARG NEXT_PUBLIC_POSTHOG_UI_HOST=https://us.posthog.com
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
ENV SKIP_ASSET_UPLOAD=${SKIP_ASSET_UPLOAD}
ENV NEXT_PUBLIC_INDOBASE_SAAS=${NEXT_PUBLIC_INDOBASE_SAAS}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_GOTRUE_URL=${NEXT_PUBLIC_GOTRUE_URL}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_ANON_KEY=${NEXT_PUBLIC_ANON_KEY}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY:-${NEXT_PUBLIC_ANON_KEY}}
ENV NEXT_PUBLIC_GITHUB_INTEGRATION_CLIENT_ID=${NEXT_PUBLIC_GITHUB_INTEGRATION_CLIENT_ID}
ENV NEXT_PUBLIC_GITHUB_INTEGRATION_APP_NAME=${NEXT_PUBLIC_GITHUB_INTEGRATION_APP_NAME}
ENV NEXT_PUBLIC_VERCEL_INTEGRATION_URL=${NEXT_PUBLIC_VERCEL_INTEGRATION_URL}
ENV NEXT_PUBLIC_RAZORPAY_BILLING=${NEXT_PUBLIC_RAZORPAY_BILLING}
ENV NEXT_PUBLIC_RAZORPAY_KEY_ID=${NEXT_PUBLIC_RAZORPAY_KEY_ID}
ENV NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY}
ENV NEXT_PUBLIC_POSTHOG_HOST=${NEXT_PUBLIC_POSTHOG_HOST}
ENV NEXT_PUBLIC_POSTHOG_UI_HOST=${NEXT_PUBLIC_POSTHOG_UI_HOST}
# Next.js build can be memory-heavy; increase Node heap if Docker has enough RAM
ENV NODE_OPTIONS="--max-old-space-size=4096"
# shared-types `out/` is gitignored; compile workspace package before Studio bundles it.
WORKDIR /workspace
RUN pnpm --filter @indobaseinc/shared-types build
# Standalone/npm copies of @indobaseinc/mcp-server dist can ship a corrupted inlined package.json string.
RUN sed -i 's/"@indobaseinc\/mcp-utils":""\^0.3.2""/"@indobaseinc\/mcp-utils":"^0.3.2"/g' \
  /workspace/packages/indobase-mcp-server/dist/chunk-A5V4CFB4.cjs \
  /workspace/packages/indobase-mcp-server/dist/chunk-WJNHYGQT.js
WORKDIR /workspace/apps/studio
# Bust build-studio GHA cache when the commit changes (ARG does not carry across stages).
ARG BUILD_SHA=unknown
RUN pnpm run build

# Final runtime: single Node server (Studio + marketing from public/)
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# Surfaced at /api/health as `version` so smoke tests can verify the running build matches the commit.
ARG BUILD_SHA=unknown
# Write to disk so GHA layer cache cannot serve a stale ENV from an older build.
RUN printf '%s' "$BUILD_SHA" > /app/BUILD_SHA
ENV BUILD_SHA=${BUILD_SHA}

# SaaS Studio: default folders so APIs start (override in Dokploy if using volumes)
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

