#!/usr/bin/env bash
# Helper: ensure PanSou + 盘搜 API + Web (dev) — for documentation / local use.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/usr/local/go/bin:${PATH}"
export PANSOU_URL="${PANSOU_URL:-http://127.0.0.1:8888}"
export DEMO_MODE=0

if ! curl -fsS --max-time 2 "$PANSOU_URL/api/health" >/dev/null 2>&1; then
  echo "[盘搜] PanSou 未就绪，请先: cd /agent/pansou && ./run-live.sh"
  exit 1
fi

cd "$ROOT"
exec npx concurrently -n api,web -c cyan,magenta \
  "PANSOU_URL=$PANSOU_URL DEMO_MODE=0 npm run dev:api" \
  "npm run dev:web"
