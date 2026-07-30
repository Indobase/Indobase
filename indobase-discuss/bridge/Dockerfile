FROM node:22-alpine AS build
WORKDIR /app
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm install && npm run build

FROM node:22-alpine
WORKDIR /app
ARG GIT_SHA=dev
ENV NODE_ENV=production
ENV GIT_SHA=$GIT_SHA
ENV DISCUSS_VERSION=$GIT_SHA
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY public ./public
EXPOSE 8092
CMD ["node", "dist/index.js"]
