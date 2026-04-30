# Build stage
FROM node:20-slim AS builder

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

# Production stage
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
