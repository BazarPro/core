#!/usr/bin/env bash
# Runs a k6 scenario in Docker and prints the summary; with BACKEND_PID also the CPU time
# the backend used.
#
#   backend/bench/run.sh bazaar.js tag500 -e VISITORS=500
#
# BASE (http://127.0.0.1:3000/api). Results land in backend/bench/results/<name>.json.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
script=$1 name=$2
shift 2
mkdir -p "$here/results"

cpu() { [ -n "${BACKEND_PID:-}" ] && awk '{print ($14+$15)/100}' "/proc/$BACKEND_PID/stat" || echo 0; }
before=$(cpu)
start=$(date +%s.%N)
docker run --rm --user "$(id -u)" --network host \
  -v "$here:/bench" -e BASE="${BASE:-http://127.0.0.1:3000/api}" "$@" \
  grafana/k6:1.3.0 run -q --summary-export "/bench/results/$name.json" "/bench/$script" \
  >"$here/results/$name.log" 2>&1 || true
node "$here/summary.mjs" "$here/results/$name.json"
if [ -n "${BACKEND_PID:-}" ]; then
  awk -v used="$(echo "$(cpu) - $before" | bc)" -v secs="$(echo "$(date +%s.%N) - $start" | bc)" \
    'BEGIN { printf "  Backend-CPU: %.1f s = %.2f Kerne im Schnitt\n", used, used / secs }'
fi
