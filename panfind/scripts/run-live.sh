#!/usr/bin/env bash
# Start 盘搜 gateway in live mode (requires PanSou on PANSOU_URL).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PORT="${PORT:-8787}"
export PANSOU_URL="${PANSOU_URL:-http://127.0.0.1:8888}"
unset DEMO_MODE || true
export DEMO_MODE=0
echo "[盘搜] PANSOU_URL=$PANSOU_URL PORT=$PORT"
exec npm run dev:api
