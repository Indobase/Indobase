# Builder Gen 3 CFOS SSO bridge — build from monorepo root context:
#   docker build -f indobase-builder-cfos/Dockerfile --build-arg GIT_SHA=... .
FROM node:22-alpine AS build
WORKDIR /app
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA

COPY packages/platform/package.json packages/platform/
COPY packages/platform/src packages/platform/src/
COPY packages/platform/tsconfig.json packages/platform/

COPY packages/cloudflare-adapter/package.json packages/cloudflare-adapter/
COPY packages/cloudflare-adapter/src packages/cloudflare-adapter/src/
COPY packages/cloudflare-adapter/tsconfig.json packages/cloudflare-adapter/

COPY packages/platform-api/package.json packages/platform-api/
COPY packages/platform-api/src packages/platform-api/src/
COPY packages/platform-api/tsconfig.json packages/platform-api/

COPY indobase-builder-cfos/bridge/package.json indobase-builder-cfos/bridge/
COPY indobase-builder-cfos/bridge/tsconfig.json indobase-builder-cfos/bridge/
COPY indobase-builder-cfos/bridge/tsconfig.build.json indobase-builder-cfos/bridge/
COPY indobase-builder-cfos/bridge/src indobase-builder-cfos/bridge/src/

WORKDIR /app/indobase-builder-cfos/bridge
# Bundle app code only — keep node_modules (Sentry/OTel) external so ESM
# dynamic requires of Node builtins work at runtime.
RUN npm install --ignore-scripts \
  && npm install --no-save esbuild@0.25.2 \
  && ./node_modules/.bin/esbuild src/index.ts \
       --bundle \
       --platform=node \
       --target=node22 \
       --format=esm \
       --packages=external \
       --outfile=dist/index.js \
       --alias:@indobase/platform=/app/packages/platform/src/index.ts \
       --alias:@indobase/cloudflare-adapter=/app/packages/cloudflare-adapter/src/index.ts \
       --alias:@indobase/platform-api=/app/packages/platform-api/src/index.ts

FROM node:22-alpine
WORKDIR /app
ARG GIT_SHA=dev
ENV NODE_ENV=production
ENV GIT_SHA=$GIT_SHA
ENV BUILDER_CFOS_VERSION=$GIT_SHA
ENV PORT=8791
COPY indobase-builder-cfos/bridge/package.json ./package.json
RUN npm install --omit=dev --ignore-scripts
COPY --from=build /app/indobase-builder-cfos/bridge/dist/index.js ./dist/index.js
EXPOSE 8791
CMD ["node", "dist/index.js"]
