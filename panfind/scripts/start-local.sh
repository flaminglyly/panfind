#!/usr/bin/env bash
# 盘搜本机一键启动：PanSou(:8888) + 网关 API(:8787) + Web(:5173)
# 用法：在 panfind 仓库根目录执行  ./scripts/start-local.sh
# 若使用 panfind-stack 解压包：在解压根目录执行 ./start-local.sh（会转到本脚本）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STACK_ROOT="$(cd "$ROOT/.." && pwd)"
# Prefer sibling pansou next to panfind (stack layout) or PANSOU_DIR
if [[ -z "${PANSOU_DIR:-}" ]]; then
  if [[ -d "$STACK_ROOT/pansou" ]]; then
    PANSOU_DIR="$STACK_ROOT/pansou"
  elif [[ -d "$ROOT/../pansou" ]]; then
    PANSOU_DIR="$(cd "$ROOT/../pansou" && pwd)"
  else
    PANSOU_DIR=""
  fi
fi

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "缺少依赖：$1"
    exit 1
  }
}

echo "== 盘搜本机启动 =="
need node
need npm
need go
need curl

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
GO_VER="$(go env GOVERSION 2>/dev/null || go version)"
echo "Node $(node -v) | $GO_VER"

if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "需要 Node.js ≥ 18（推荐 20/22 LTS）"
  exit 1
fi

# Go 1.22+ 可用；pansou go.mod 声明 1.25 时会自动拉 toolchain（需网络）
GO_MINOR="$(go env GOVERSION | sed -E 's/^go([0-9]+)\.([0-9]+).*/\2/' || echo 0)"
GO_MAJOR="$(go env GOVERSION | sed -E 's/^go([0-9]+)\..*/\1/' || echo 0)"
if [[ "${GO_MAJOR:-0}" -lt 1 ]] || { [[ "${GO_MAJOR:-0}" -eq 1 ]] && [[ "${GO_MINOR:-0}" -lt 22 ]]; }; then
  echo "需要 Go ≥ 1.22（推荐 1.25；不足时请升级：https://go.dev/dl/）"
  exit 1
fi

if [[ -z "$PANSOU_DIR" || ! -d "$PANSOU_DIR" ]]; then
  echo "未找到 pansou 目录。请将 pansou 与 panfind 并列放置，或设置 PANSOU_DIR=/path/to/pansou"
  exit 1
fi

export PANSOU_URL="${PANSOU_URL:-http://127.0.0.1:8888}"
export DEMO_MODE="${DEMO_MODE:-0}"
export PORT="${PORT:-8787}"
export PATH="${PATH}"

# Build pansou if missing / stale
if [[ ! -x "$PANSOU_DIR/pansou" ]]; then
  echo "编译 PanSou…"
  (cd "$PANSOU_DIR" && CGO_ENABLED=0 go build -ldflags='-s -w' -o pansou .)
fi

mkdir -p "$ROOT/.run-logs"
PANSOU_LOG="$ROOT/.run-logs/pansou.log"
API_LOG="$ROOT/.run-logs/api.log"
WEB_LOG="$ROOT/.run-logs/web.log"

cleanup() {
  echo
  echo "正在停止…"
  [[ -n "${PANSOU_PID:-}" ]] && kill "$PANSOU_PID" 2>/dev/null || true
  [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Free ports if leftover (best-effort)
for p in 8888 8787 5173; do
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${p}/tcp" 2>/dev/null || true
  fi
done
sleep 0.5

echo "启动 PanSou → :8888 （日志 $PANSOU_LOG）"
(
  cd "$PANSOU_DIR"
  if [[ -x ./run-live.sh ]]; then
    exec ./run-live.sh
  else
    export PORT=8888
    exec ./pansou
  fi
) >"$PANSOU_LOG" 2>&1 &
PANSOU_PID=$!

echo -n "等待 PanSou 健康检查"
for i in $(seq 1 60); do
  if curl -fsS --max-time 1 "$PANSOU_URL/api/health" >/dev/null 2>&1; then
    echo " OK"
    break
  fi
  if ! kill -0 "$PANSOU_PID" 2>/dev/null; then
    echo
    echo "PanSou 进程已退出，见 $PANSOU_LOG"
    tail -40 "$PANSOU_LOG" || true
    exit 1
  fi
  echo -n "."
  sleep 0.5
  if [[ "$i" -eq 60 ]]; then
    echo
    echo "PanSou 启动超时，见 $PANSOU_LOG"
    exit 1
  fi
done

echo "安装 / 检查 npm 依赖…"
(cd "$ROOT" && npm install --silent)

echo "启动盘搜 API → :$PORT （PANSOU_URL=$PANSOU_URL DEMO_MODE=$DEMO_MODE）"
(
  cd "$ROOT"
  export PANSOU_URL DEMO_MODE PORT
  exec npm run dev:api
) >"$API_LOG" 2>&1 &
API_PID=$!

echo "启动盘搜 Web → :5173"
(
  cd "$ROOT"
  exec npm run dev:web
) >"$WEB_LOG" 2>&1 &
WEB_PID=$!

for i in $(seq 1 40); do
  if curl -fsS --max-time 1 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 \
    && curl -fsS --max-time 1 "http://127.0.0.1:5173/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.4
done

HEALTH="$(curl -fsS --max-time 3 "http://127.0.0.1:$PORT/api/health" || true)"
echo
echo "============================================"
echo "  浏览器打开： http://localhost:5173"
echo "  搜索 API：   http://localhost:$PORT"
echo "  PanSou：     $PANSOU_URL"
echo "  健康检查：   $HEALTH"
echo "  日志目录：   $ROOT/.run-logs/"
echo "  按 Ctrl+C 停止全部进程"
echo "============================================"
echo

# Keep foreground
while true; do
  kill -0 "$PANSOU_PID" 2>/dev/null || { echo "PanSou 已退出"; exit 1; }
  kill -0 "$API_PID" 2>/dev/null || { echo "API 已退出，见 $API_LOG"; exit 1; }
  kill -0 "$WEB_PID" 2>/dev/null || { echo "Web 已退出，见 $WEB_LOG"; exit 1; }
  sleep 2
done
