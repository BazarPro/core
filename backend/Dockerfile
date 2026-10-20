# BazarPro backend (replaces convex-backend and convex-init).
# Build from the repository root, the mail and error texts come from src/locales:
#   docker build -f backend/Dockerfile .
FROM rust:1.99-slim AS builder

WORKDIR /app/backend
COPY backend/Cargo.toml backend/Cargo.lock ./
# Build the dependencies once, so code changes do not rebuild them
RUN mkdir src && echo 'fn main() {}' > src/main.rs && touch src/lib.rs \
    && cargo build --release && rm -rf src
COPY src/locales /app/src/locales
COPY backend/migrations ./migrations
COPY backend/src ./src
RUN touch src/main.rs src/lib.rs && cargo build --release

FROM debian:trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/backend/target/release/bazarpro-backend /usr/local/bin/bazarpro-backend

USER nobody
EXPOSE 3000
ENV LISTEN_ADDR=0.0.0.0:3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s \
  CMD curl -fs http://127.0.0.1:3000/healthz || exit 1

CMD ["bazarpro-backend"]
