# Indobase Video — multi-stage image
# CI tag: roshanraghavander/indobase-video:<git-sha>

FROM node:22-bookworm-slim AS web-build
WORKDIR /src/web
COPY web/package.json ./
RUN npm install --no-fund --no-audit
COPY web/ ./
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8780
ENV STATIC_ROOT=/app/web/dist
COPY server/server.mjs /app/server/server.mjs
COPY --from=web-build /src/web/dist /app/web/dist
# Ensure brand assets exist even if Vite public copy missed them
COPY web/public/ /app/web/dist/
EXPOSE 8780
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8780/sso/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/server.mjs"]
