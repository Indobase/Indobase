# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS deps
WORKDIR /app

ENV CI=true \
    HUSKY=0 \
    PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ git && rm -rf /var/lib/apt/lists/*
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM node:22-bookworm-slim AS build
WORKDIR /app

ENV CI=true \
    HUSKY=0 \
    PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ git && rm -rf /var/lib/apt/lists/*
RUN corepack enable

COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/package.json /app/package.json
COPY --from=deps /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY . .

ARG NODE_ENV=production
ARG VITE_LOG_LEVEL=info
ARG DEFAULT_NUM_CTX=32768
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SUPABASE_ACCESS_TOKEN
ARG VITE_GITHUB_ACCESS_TOKEN
ARG VITE_GITHUB_TOKEN_TYPE
ARG VITE_GITLAB_ACCESS_TOKEN
ARG VITE_GITLAB_URL
ARG VITE_GITLAB_TOKEN_TYPE
ARG VITE_VERCEL_ACCESS_TOKEN
ARG VITE_NETLIFY_ACCESS_TOKEN
ARG VITE_DISABLE_PERSISTENCE
ARG VITE_APP_VERSION
ARG VITE_GIT_BRANCH
ARG VITE_GIT_COMMIT
ARG VITE_SENTRY_DSN
ARG OPENAI_LIKE_API_BASE_URL
ARG OPENAI_LIKE_API_MODELS
ARG OLLAMA_API_BASE_URL
ARG LMSTUDIO_API_BASE_URL
ARG TOGETHER_API_BASE_URL
ARG BUILD_NODE_OPTIONS=--max-old-space-size=4096

ENV NODE_ENV=$NODE_ENV \
    VITE_LOG_LEVEL=$VITE_LOG_LEVEL \
    DEFAULT_NUM_CTX=$DEFAULT_NUM_CTX \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_SUPABASE_ACCESS_TOKEN=$VITE_SUPABASE_ACCESS_TOKEN \
    VITE_GITHUB_ACCESS_TOKEN=$VITE_GITHUB_ACCESS_TOKEN \
    VITE_GITHUB_TOKEN_TYPE=$VITE_GITHUB_TOKEN_TYPE \
    VITE_GITLAB_ACCESS_TOKEN=$VITE_GITLAB_ACCESS_TOKEN \
    VITE_GITLAB_URL=$VITE_GITLAB_URL \
    VITE_GITLAB_TOKEN_TYPE=$VITE_GITLAB_TOKEN_TYPE \
    VITE_VERCEL_ACCESS_TOKEN=$VITE_VERCEL_ACCESS_TOKEN \
    VITE_NETLIFY_ACCESS_TOKEN=$VITE_NETLIFY_ACCESS_TOKEN \
    VITE_DISABLE_PERSISTENCE=$VITE_DISABLE_PERSISTENCE \
    VITE_APP_VERSION=$VITE_APP_VERSION \
    VITE_GIT_BRANCH=$VITE_GIT_BRANCH \
    VITE_GIT_COMMIT=$VITE_GIT_COMMIT \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    OPENAI_LIKE_API_BASE_URL=$OPENAI_LIKE_API_BASE_URL \
    OPENAI_LIKE_API_MODELS=$OPENAI_LIKE_API_MODELS \
    OLLAMA_API_BASE_URL=$OLLAMA_API_BASE_URL \
    LMSTUDIO_API_BASE_URL=$LMSTUDIO_API_BASE_URL \
    TOGETHER_API_BASE_URL=$TOGETHER_API_BASE_URL

RUN NODE_OPTIONS=$BUILD_NODE_OPTIONS pnpm build
RUN pnpm prune --prod --ignore-scripts

FROM node:22-bookworm-slim AS bolt-ai-production
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5173 \
    RUNNING_IN_DOCKER=true

ARG VITE_GIT_COMMIT
ENV BUILD_SHA=${VITE_GIT_COMMIT} \
    VITE_GIT_COMMIT=${VITE_GIT_COMMIT}

RUN apt-get update && apt-get install -y --no-install-recommends git tini && rm -rf /var/lib/apt/lists/* \
  && test -x /usr/local/bin/npm \
  && ln -sf /usr/local/bin/npm /usr/bin/npm

COPY --chown=node:node --from=build /app/package.json /app/package.json
COPY --chown=node:node --from=build /app/node_modules /app/node_modules
COPY --chown=node:node --from=build /app/build /app/build
COPY --chown=node:node --from=build /app/public /app/public
COPY --chown=node:node --from=build /app/server.js /app/server.js
COPY --chown=node:node --from=build /app/templates /app/templates

USER node

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 5173) + '/api/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]

FROM build AS development
ENV RUNNING_IN_DOCKER=true
RUN mkdir -p /app/run
CMD ["pnpm", "run", "dev", "--host", "0.0.0.0"]
