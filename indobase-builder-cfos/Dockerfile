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

COPY indobase-builder-cfos/bridge/package.json indobase-builder-cfos/bridge/
COPY indobase-builder-cfos/bridge/tsconfig.json indobase-builder-cfos/bridge/
COPY indobase-builder-cfos/bridge/tsconfig.build.json indobase-builder-cfos/bridge/
COPY indobase-builder-cfos/bridge/src indobase-builder-cfos/bridge/src/

WORKDIR /app/indobase-builder-cfos/bridge
# file: deps resolve to ../../packages/*
RUN npm install --ignore-scripts \
  && npx --yes esbuild src/index.ts \
    --bundle \
    --platform=node \
    --format=esm \
    --outfile=dist/index.js \
    --packages=bundle \
    --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"

FROM node:22-alpine
WORKDIR /app
ARG GIT_SHA=dev
ENV NODE_ENV=production
ENV GIT_SHA=$GIT_SHA
ENV BUILDER_CFOS_VERSION=$GIT_SHA
ENV PORT=8791
COPY --from=build /app/indobase-builder-cfos/bridge/dist/index.js ./dist/index.js
EXPOSE 8791
CMD ["node", "dist/index.js"]
