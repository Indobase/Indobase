FROM node:22-alpine

WORKDIR /app
COPY server.mjs package.json ./

ENV NODE_ENV=production
EXPOSE 8600

USER node
CMD ["node", "server.mjs"]
