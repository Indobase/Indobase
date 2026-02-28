FROM node:22-bookworm-slim AS deps
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate
# Copy minimal workspace manifests for faster install caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
COPY apps/studio/package.json ./apps/studio/package.json
# Also copy local workspace package manifests that studio depends on
COPY packages ./packages
COPY blocks ./blocks
COPY apps ./apps
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS builder
WORKDIR /workspace/apps/studio
ENV NODE_ENV=production
ARG SKIP_ASSET_UPLOAD=1
ENV SKIP_ASSET_UPLOAD=${SKIP_ASSET_UPLOAD}
ARG NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
# Build Next.js in standalone output mode (already configured in next.config.js)
RUN pnpm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8082
# Copy Next standalone output and static assets
COPY --from=builder /workspace/apps/studio/.next/standalone ./
COPY --from=builder /workspace/apps/studio/public ./public
COPY --from=builder /workspace/apps/studio/.next/static ./.next/static
EXPOSE 8082
CMD ["node", "server.js"]
