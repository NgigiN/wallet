# syntax=docker/dockerfile:1
# Build context is the REPO ROOT (ruling R-1B-2): the image ships the API and the web
# PWA together, so a single origin serves both and the app needs no CORS.
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine AS build
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json server/drizzle.config.ts ./
COPY server/src ./src
COPY server/drizzle ./drizzle
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production STATIC_DIR=/app/public PORT=8080
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./
COPY --from=web /web/dist ./public
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
EXPOSE 8080
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
