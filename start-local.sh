#!/usr/bin/env bash
# panfind-stack 根目录一键入口
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec "$ROOT/panfind/scripts/start-local.sh"
