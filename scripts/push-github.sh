#!/usr/bin/env bash
# 在「已登录 gh 的本机」执行：创建 flaminglyly/panfind 并推送当前目录。
# 用法：在解压后的 panfind-stack 根目录：  ./scripts/push-github.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "需要安装 GitHub CLI：https://cli.github.com/"
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "本机未登录 gh。请先： gh auth login"
  exit 1
fi

VISIBILITY="${VISIBILITY:-public}"
REPO="flaminglyly/panfind"
REMOTE_URL="https://github.com/${REPO}.git"

if [[ ! -d .git ]]; then
  git init -b main
fi

git add -A
if git diff --cached --quiet && git rev-parse HEAD >/dev/null 2>&1; then
  echo "无新变更可提交（已有 commit）"
else
  git -c user.email="${GIT_AUTHOR_EMAIL:-dev@local}" -c user.name="${GIT_AUTHOR_NAME:-PanFind}" \
    commit -m "chore: 盘搜 PanFind 本机栈（网关 + PanSou 源码）" || true
fi

if gh repo view "$REPO" >/dev/null 2>&1; then
  echo "仓库已存在：$REMOTE_URL"
else
  echo "创建仓库 $REPO （$VISIBILITY）…"
  gh repo create "$REPO" --"$VISIBILITY" --description "盘搜 PanFind — 百度/夸克/迅雷公开分享元搜索（PanSou 范式）" --source=. --remote=origin || {
    # create without --source if remote already partially set
    gh repo create "$REPO" --"$VISIBILITY" --description "盘搜 PanFind — 百度/夸克/迅雷公开分享元搜索（PanSou 范式）"
  }
fi

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

git push -u origin main
echo
echo "完成： $REMOTE_URL"
echo "克隆后启动："
echo "  git clone $REMOTE_URL && cd panfind && ./start-local.sh"
echo "  浏览器打开 http://localhost:5173"
