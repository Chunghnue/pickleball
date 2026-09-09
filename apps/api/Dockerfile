# syntax=docker/dockerfile:1

# ----------------------------------------------------------------------------
# build: full dependency install + `nest build`.
# This stage is also used as the migration runner (it keeps ts-node, the
# TypeScript sources and `src/migrations/*.ts` that `npm run migration:run`
# needs — see docker-compose.prod.yml `api-migrate`).
# ----------------------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ----------------------------------------------------------------------------
# prod-deps: production-only node_modules for a small runtime image.
# ----------------------------------------------------------------------------
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ----------------------------------------------------------------------------
# runtime: just node + dist + production deps.
# ----------------------------------------------------------------------------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    UPLOADS_DIR=/app/uploads
WORKDIR /app
RUN mkdir -p /app/uploads && chown -R node:node /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
