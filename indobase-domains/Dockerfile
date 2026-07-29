FROM node:22-alpine AS console-build
WORKDIR /console
COPY console/package.json ./
RUN npm install
COPY console/ ./
RUN npm run build

FROM node:22-alpine AS bridge-build
WORKDIR /app
COPY bridge/package.json bridge/tsconfig.json ./
COPY bridge/src ./src
RUN npm install && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY bridge/package.json ./
RUN npm install --omit=dev
COPY --from=bridge-build /app/dist ./dist
COPY --from=console-build /console/dist ./console-dist
EXPOSE 8094
CMD ["node", "dist/index.js"]
