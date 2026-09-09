# syntax=docker/dockerfile:1

# ----------------------------------------------------------------------------
# deps: install dependencies.
# ----------------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ----------------------------------------------------------------------------
# build: `next build` -> .next/standalone (output: "standalone").
#
# NOTE: NEXT_PUBLIC_* values and the `rewrites()` destination (which embeds
# API_BASE_URL) are baked in at build time. If the API host or the Maps key
# changes, the image must be rebuilt.
# ----------------------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
ARG API_BASE_URL=http://api:3001
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
ENV API_BASE_URL=$API_BASE_URL \
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ----------------------------------------------------------------------------
# runtime: minimal standalone server, no node_modules install.
# ----------------------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
