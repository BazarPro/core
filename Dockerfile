# Build stage
FROM node:24-slim AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci
RUN npx playwright install --with-deps chromium

# Copy source code
COPY . .

# Backend the prerendered pages and the build-time sitemap read from, e.g.
# https://bazarpro.de (its /api); without it they are rendered without data
ARG BACKEND_URL
ARG DOMAIN_NAME
ARG VITE_PLAUSIBLE_API_HOST
ARG VITE_SITE_URL
ARG VITE_APP_VERSION
ENV BACKEND_URL=$BACKEND_URL
ENV DOMAIN_NAME=$DOMAIN_NAME
ENV VITE_PLAUSIBLE_API_HOST=$VITE_PLAUSIBLE_API_HOST
ENV VITE_SITE_URL=$VITE_SITE_URL
ENV VITE_APP_VERSION=$VITE_APP_VERSION

# Build the application
RUN npm run build:prerender

# Production stage: Node server with server-side SEO (server/index.ts).
# Node 24 runs the TypeScript sources directly (type stripping), no build step.
FROM node:24-alpine

WORKDIR /app

ARG VITE_SITE_URL
# The backend image (backend/Dockerfile) answers under the same domain at /api;
# BACKEND_URL is its address inside the network, for server-side SEO
ENV NODE_ENV=production \
    PORT=8080 \
    BACKEND_URL=http://backend:3000 \
    SITE_URL=$VITE_SITE_URL \
    BUILD_SITE_URL=$VITE_SITE_URL

COPY package.json ./
COPY server ./server
# Code the web server shares with the app (server/dockerfile.test.ts checks the list)
COPY src/lib/markdown.ts ./src/lib/markdown.ts
COPY src/shared/productLinks.ts ./src/shared/productLinks.ts
COPY src/shared/appRoutes.ts ./src/shared/appRoutes.ts
COPY src/shared/eventJsonLd.ts ./src/shared/eventJsonLd.ts
COPY --from=builder /app/dist ./dist

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/index.ts"]
