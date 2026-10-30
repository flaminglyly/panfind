#!/usr/bin/env bash
# 盘搜本机一键启动：PanSou(:8888) + 网关 API(:8787) + Web(:5173)
# 用法：
#   解压根目录：./start-local.sh
#   或：./panfind/scripts/start-local.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STACK_ROOT="$(cd "$ROOT/.." && pwd)"

# Initialize under set -u before any trap/cleanup
PANSOU_DIR="${PANSOU_DIR:-}"
PANSOU_PID=""
API_PID=""
WEB_PID=""
PANSOU_LOG="${PANSOU_LOG:-$ROOT/.run-logs/pansou.log}"
API_LOG="${API_LOG:-$ROOT/.run-logs/api.log}"
WEB_LOG="${WEB_LOG:-$ROOT/.run-logs/web.log}"

if [[ -z "$PANSOU_DIR" ]]; then
  if [[ -d "$STACK_ROOT/pansou" ]]; then
    PANSOU_DIR="$STACK_ROOT/pansou"
  elif [[ -d "$ROOT/../pansou" ]]; then
    PANSOU_DIR="$(cd "$ROOT/../pansou" && pwd)"
  fi
fi

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "缺少依赖：$1"
    exit 1
  }
}

# Free a TCP listen port (macOS + Linux). Never use Linux-only fuser -k PORT/tcp on macOS.
free_port() {
  local port="$1"
  local pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
  elif command -v fuser >/dev/null 2>&1; then
    # Linux fuser; ignore failures / macOS stub
    pids="$(fuser "$port/tcp" 2>/dev/null || true)"
  fi
  if [[ -n "${pids}" ]]; then
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.2
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  fi
}

cleanup() {
  echo
  echo "正在停止…"
  if [[ -n "${PANSOU_PID}" ]]; then kill "${PANSOU_PID}" 2>/dev/null || true; fi
  if [[ -n "${API_PID}" ]]; then kill "${API_PID}" 2>/dev/null || true; fi
  if [[ -n "${WEB_PID}" ]]; then kill "${WEB_PID}" 2>/dev/null || true; fi
  wait 2>/dev/null || true
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

GO_MINOR="$(go env GOVERSION | sed -E 's/^go([0-9]+)\.([0-9]+).*/\2/' || echo 0)"
GO_MAJOR="$(go env GOVERSION | sed -E 's/^go([0-9]+)\..*/\1/' || echo 0)"
if [[ "${GO_MAJOR:-0}" -lt 1 ]] || { [[ "${GO_MAJOR:-0}" -eq 1 ]] && [[ "${GO_MINOR:-0}" -lt 22 ]]; }; then
  echo "需要 Go ≥ 1.22（推荐 1.25；不足时请升级：https://go.dev/dl/）"
  exit 1
fi

if [[ -z "${PANSOU_DIR}" || ! -d "${PANSOU_DIR}" ]]; then
  echo "未找到 pansou 目录。请将 pansou 与 panfind 并列放置，或设置 PANSOU_DIR=/path/to/pansou"
  exit 1
fi

export PANSOU_URL="${PANSOU_URL:-http://127.0.0.1:8888}"
export DEMO_MODE="${DEMO_MODE:-0}"
export ENABLE_EXT_SOURCES="${ENABLE_EXT_SOURCES:-1}"
export ENABLE_WEIBO="${ENABLE_WEIBO:-0}"
# WEIBO_COOKIE / WEIBO_UIDS / WEIBO_ALLOW_DEMO：用户自备，若已 export 则透传（勿写入脚本）
export WEIBO_COOKIE="${WEIBO_COOKIE:-}"
export WEIBO_UIDS="${WEIBO_UIDS:-}"
export WEIBO_ALLOW_DEMO="${WEIBO_ALLOW_DEMO:-0}"
export WEIBO_FETCH_COMMENTS="${WEIBO_FETCH_COMMENTS:-1}"
export WEIBO_MAX_PAGES="${WEIBO_MAX_PAGES:-2}"
# API listen port (must NOT be inherited by PanSou — PanSou uses 8888)
API_PORT="${API_PORT:-${PORT:-8787}}"
PANSOU_PORT="${PANSOU_PORT:-8888}"
# Clear generic PORT so child scripts/binaries do not steal the API port
unset PORT || true
export GO111MODULE=on
export GOTOOLCHAIN="${GOTOOLCHAIN:-go1.25.0}"
export PATH="${PATH}:/usr/local/go/bin:/opt/homebrew/bin"

if [[ ! -f "${PANSOU_DIR}/go.mod" ]]; then
  echo "错误：pansou 缺少 go.mod：${PANSOU_DIR}"
  exit 1
fi
if [[ ! -d "${PANSOU_DIR}/util/cache" ]]; then
  echo "错误：pansou 源码不完整，缺少 util/cache。"
  echo "  cd \"${PANSOU_DIR}\""
  echo "  curl -sL https://github.com/fish2018/pansou/archive/refs/heads/main.tar.gz | tar -xz -C /tmp"
  echo "  rm -rf util/cache && cp -R /tmp/pansou-main/util/cache util/"
  exit 1
fi

echo "编译 PanSou（模块根：${PANSOU_DIR}，GOTOOLCHAIN=${GOTOOLCHAIN}）…"
(
  cd "${PANSOU_DIR}"
  go mod download
  CGO_ENABLED=0 go build -ldflags='-s -w' -o pansou .
)

mkdir -p "${ROOT}/.run-logs"
PANSOU_LOG="${ROOT}/.run-logs/pansou.log"
API_LOG="${ROOT}/.run-logs/api.log"
WEB_LOG="${ROOT}/.run-logs/web.log"

trap cleanup EXIT INT TERM

echo "释放端口 ${PANSOU_PORT} / ${API_PORT} / 5173（lsof）…"
free_port "${PANSOU_PORT}"
free_port "${API_PORT}"
free_port 5173
sleep 0.3

echo "启动 PanSou → :${PANSOU_PORT} （强制 PORT=${PANSOU_PORT}，日志 ${PANSOU_LOG}）"
(
  cd "${PANSOU_DIR}"
  # Critical: do not inherit API_PORT/PORT=8787 — PanSou must listen on 8888
  export PORT="${PANSOU_PORT}"
  if [[ -x ./run-live.sh ]]; then
    exec env PORT="${PANSOU_PORT}" ./run-live.sh
  else
    exec env PORT="${PANSOU_PORT}" ./pansou
  fi
) >"${PANSOU_LOG}" 2>&1 &
PANSOU_PID=$!

PANSOU_HEALTH_URL="${PANSOU_URL%/}/api/health"
# If PANSOU_URL was wrongly pointed at API port, still probe the real PanSou port
if [[ "${PANSOU_URL}" != *":${PANSOU_PORT}"* ]]; then
  PANSOU_HEALTH_URL="http://127.0.0.1:${PANSOU_PORT}/api/health"
fi

echo -n "等待 PanSou 健康检查 ${PANSOU_HEALTH_URL}"
for i in $(seq 1 60); do
  if curl -fsS --max-time 1 "${PANSOU_HEALTH_URL}" >/dev/null 2>&1; then
    echo " OK"
    break
  fi
  if ! kill -0 "${PANSOU_PID}" 2>/dev/null; then
    echo
    echo "PanSou 进程已退出，见 ${PANSOU_LOG}"
    tail -40 "${PANSOU_LOG}" || true
    exit 1
  fi
  echo -n "."
  sleep 0.5
  if [[ "$i" -eq 60 ]]; then
    echo
    echo "PanSou 启动超时，见 ${PANSOU_LOG}"
    echo "请确认日志中为「服务器地址: http://localhost:${PANSOU_PORT}」，而非 ${API_PORT}"
    tail -40 "${PANSOU_LOG}" || true
    exit 1
  fi
done

echo "安装 / 检查 npm 依赖…"
(cd "${ROOT}" && npm install --silent)

echo "启动盘搜 API → :${API_PORT} （PANSOU_URL=${PANSOU_URL} DEMO_MODE=${DEMO_MODE} WEIBO=${ENABLE_WEIBO}）"
(
  cd "${ROOT}"
  export PANSOU_URL DEMO_MODE ENABLE_EXT_SOURCES ENABLE_WEIBO
  export WEIBO_COOKIE WEIBO_UIDS WEIBO_ALLOW_DEMO WEIBO_FETCH_COMMENTS WEIBO_MAX_PAGES
  export PORT="${API_PORT}"
  exec env \
    PORT="${API_PORT}" \
    PANSOU_URL="${PANSOU_URL}" \
    DEMO_MODE="${DEMO_MODE}" \
    ENABLE_EXT_SOURCES="${ENABLE_EXT_SOURCES}" \
    ENABLE_WEIBO="${ENABLE_WEIBO}" \
    WEIBO_COOKIE="${WEIBO_COOKIE}" \
    WEIBO_UIDS="${WEIBO_UIDS}" \
    WEIBO_ALLOW_DEMO="${WEIBO_ALLOW_DEMO}" \
    WEIBO_FETCH_COMMENTS="${WEIBO_FETCH_COMMENTS}" \
    WEIBO_MAX_PAGES="${WEIBO_MAX_PAGES}" \
    npm run dev:api
) >"${API_LOG}" 2>&1 &
API_PID=$!

echo "启动盘搜 Web → :5173"
(
  cd "${ROOT}"
  exec npm run dev:web
) >"${WEB_LOG}" 2>&1 &
WEB_PID=$!

for i in $(seq 1 40); do
  if curl -fsS --max-time 1 "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1 \
    && curl -fsS --max-time 1 "http://127.0.0.1:5173/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.4
done

HEALTH="$(curl -fsS --max-time 3 "http://127.0.0.1:${API_PORT}/api/health" || true)"
echo
echo "============================================"
echo "  浏览器打开： http://localhost:5173"
echo "  搜索 API：   http://localhost:${API_PORT}"
echo "  PanSou：     http://127.0.0.1:${PANSOU_PORT}  (PANSOU_URL=${PANSOU_URL})"
echo "  健康检查：   ${HEALTH}"
echo "  日志目录：   ${ROOT}/.run-logs/"
echo "  按 Ctrl+C 停止全部进程"
echo "============================================"
echo

while true; do
  kill -0 "${PANSOU_PID}" 2>/dev/null || { echo "PanSou 已退出"; exit 1; }
  kill -0 "${API_PID}" 2>/dev/null || { echo "API 已退出，见 ${API_LOG}"; exit 1; }
  kill -0 "${WEB_PID}" 2>/dev/null || { echo "Web 已退出，见 ${WEB_LOG}"; exit 1; }
  sleep 2
done
