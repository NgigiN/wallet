# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production STATIC_DIR=/app/public PORT=8080
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./
# Phase 1B adds the web bundle by copying web/dist into server/public before the
# image build (the compose build context stays ../server); an empty dir is fine
# for API-only runs.
RUN mkdir -p /app/public
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
EXPOSE 8080
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
