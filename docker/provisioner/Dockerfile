FROM node:20-alpine

WORKDIR /app
COPY server.mjs /app/server.mjs

EXPOSE 8787
ENV NODE_ENV=production

CMD ["node", "/app/server.mjs"]

