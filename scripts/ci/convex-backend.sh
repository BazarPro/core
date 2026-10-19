#!/usr/bin/env bash
# Starts a throwaway self-hosted Convex backend in Docker and deploys the functions
# to it, so E2E tests run without Convex Cloud. Used by the e2e-test CI job:
#
#   eval "$(scripts/ci/convex-backend.sh)"   # exports CONVEX_SELF_HOSTED_URL and friends
#   scripts/ci/convex-backend.sh stop
#
# Environment (all optional):
#   CONVEX_CONTAINER  container name                 (default bazarpro-e2e-convex)
#   SITE_URL          frontend URL the backend redirects to after login
#                                                    (default http://127.0.0.1:5173)
set -euo pipefail

cd "$(dirname "$0")/../.."

NAME=${CONVEX_CONTAINER:-bazarpro-e2e-convex}
# The backend fetches its own auth config from the site origin, so the host ports
# must match the ports inside the container
PORT=3210
SITE_PORT=3211
SITE_URL=${SITE_URL:-http://127.0.0.1:5173}

if [ "${1:-}" = "stop" ]; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  exit 0
fi

# Same backend release as production (docker-compose.yml)
VERSION=${CONVEX_VERSION:-$(grep -oP 'convex-backend:\$\{CONVEX_VERSION:-\K[0-9a-f]+' docker-compose.yml)}
URL="http://127.0.0.1:$PORT"

# Progress goes to stderr, stdout is only the export lines for eval
{
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" \
    -p "127.0.0.1:$PORT:$PORT" -p "127.0.0.1:$SITE_PORT:$SITE_PORT" \
    -e CONVEX_CLOUD_ORIGIN="$URL" \
    -e CONVEX_SITE_ORIGIN="http://127.0.0.1:$SITE_PORT" \
    "ghcr.io/convex/convex-backend:$VERSION" >/dev/null

  for _ in $(seq 1 60); do
    curl -fs "$URL/version" >/dev/null && break
    sleep 1
  done
  curl -fs "$URL/version" >/dev/null || { echo "Convex backend did not start" >&2; exit 1; }

  ADMIN_KEY=$(docker exec "$NAME" ./generate_admin_key.sh | tail -n 1)

  CONVEX_SELF_HOSTED_URL="$URL" CONVEX_SELF_HOSTED_ADMIN_KEY="$ADMIN_KEY" SITE_URL="$SITE_URL" \
    node scripts/selfhost/init.mjs
} >&2

cat <<EOF
export CONVEX_SELF_HOSTED=true
export CONVEX_SELF_HOSTED_URL=$URL
export CONVEX_SELF_HOSTED_ADMIN_KEY='$ADMIN_KEY'
export VITE_CONVEX_URL=$URL
export CONVEX_URL=$URL
EOF
