# Build stage
FROM node:24-slim AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci
RUN npx playwright install --with-deps chromium

# Copy source code
COPY . .

ARG VITE_CONVEX_URL
ARG DOMAIN_NAME
ARG VITE_PLAUSIBLE_API_HOST
ARG VITE_SITE_URL
ARG VITE_APP_VERSION
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
ENV DOMAIN_NAME=$DOMAIN_NAME
ENV VITE_PLAUSIBLE_API_HOST=$VITE_PLAUSIBLE_API_HOST
ENV VITE_SITE_URL=$VITE_SITE_URL
ENV VITE_APP_VERSION=$VITE_APP_VERSION

# Build the application
RUN npm run build:prerender

# Convex setup for self-hosted instances (docker-compose.selfhost.yml):
# deploys the functions and sets the backend environment variables.
FROM node:24-alpine AS convex-init

WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node convex.json ./
COPY --chown=node:node convex ./convex
RUN rm -rf convex/tests
COPY --chown=node:node scripts/selfhost ./scripts/selfhost

ENTRYPOINT ["node", "scripts/selfhost/init.mjs"]

# Production stage: Node server with server-side SEO (server/index.ts).
# Node 24 runs the TypeScript sources directly (type stripping), no build step.
FROM node:24-alpine

WORKDIR /app

ARG VITE_CONVEX_URL
ARG VITE_SITE_URL
ENV NODE_ENV=production \
    PORT=8080 \
    CONVEX_URL=$VITE_CONVEX_URL \
    SITE_URL=$VITE_SITE_URL \
    BUILD_SITE_URL=$VITE_SITE_URL

COPY package.json ./
COPY server ./server
COPY src/lib/markdown.ts ./src/lib/markdown.ts
COPY --from=builder /app/dist ./dist

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/index.ts"]
