# 盘搜本机运行指南（实时 PanSou）

目标：在你自己的电脑浏览器打开 **http://localhost:5173**，使用实时公开分享检索（百度 / 夸克 / 迅雷）。

> 本 Project **没有**可用的 GitHub 推送凭据（`gh` 未登录），因此无法提供 clone URL。请使用下方 **tarball** 或从本 VM 路径复制源码。

---

## 获取源码

**推荐：下载打包文件**

| 项 | 值 |
|----|-----|
| 路径 | `/cursor/stores/self/media/panfind-local/panfind-stack.tgz` |
| 内容 | `panfind/`（网关+Web）+ `pansou/`（上游源码与启动脚本）+ 根目录 `start-local.sh` / `README-LOCAL.md` |
| 不含 | `node_modules`、PanSou 编译产物、缓存、`.git`（体积更小，跨平台需本机编译） |

解压：

```bash
mkdir -p ~/panfind-stack && cd ~/panfind-stack
tar -xzf /path/to/panfind-stack.tgz
# 解压后应看到 panfind/  pansou/  start-local.sh  README-LOCAL.md
```

---

## 环境前提（macOS / Linux）

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| **Node.js** | ≥ 18（推荐 20 / 22 LTS） | 前端 Vite + 网关 Express |
| **Go** | ≥ 1.22（推荐 **1.25**） | 编译 pansou；若 go.mod 要求更高，Go 会尝试自动下载 toolchain（需联网） |
| **curl** | 任意 | 健康检查 |
| 网络 | 可访问 TG 公开页 `t.me` 与插件源站 | 本 VM 实测**无需代理**；若你所在网络拦截 TG，见下文代理 |

Windows：建议 WSL2（Ubuntu）按 Linux 步骤运行。

检查：

```bash
node -v
go version
```

---

## 三步启动（一键）

```bash
cd ~/panfind-stack          # 解压根目录
chmod +x start-local.sh panfind/scripts/start-local.sh pansou/run-live.sh
./start-local.sh
```

脚本会：检查 Node/Go → 编译 pansou（若尚无二进制）→ 起 PanSou `:8888` → `npm install` → 起 API `:8787`（`PANSOU_URL` + `DEMO_MODE=0`）→ 起 Web `:5173`。

然后用浏览器打开：

**http://localhost:5173**

应看到绿色徽章「实时聚合（PanSou）」。按 `Ctrl+C` 停止全部进程。

### 端口一览

| 服务 | 地址 |
|------|------|
| PC Web | http://localhost:5173 |
| 盘搜 API | http://localhost:8787 |
| PanSou | http://localhost:8888 |

---

## 分步启动（调试用）

```bash
# 终端 1 — PanSou
cd ~/panfind-stack/pansou
chmod +x run-live.sh
./run-live.sh    # 首次会先 go build

# 终端 2 — 盘搜
cd ~/panfind-stack/panfind
npm install
export PANSOU_URL=http://127.0.0.1:8888
export DEMO_MODE=0
npm run dev      # 同时起 API + Web
```

健康检查：

```bash
curl -s http://127.0.0.1:8888/api/health | head
curl -s http://127.0.0.1:8787/api/health
```

`liveReady: true` 且 `modeLabel` 含「实时」即表示已接上游。

---

## TG / 代理（已知限制）

- 默认 `pansou/run-live.sh` **不设置** `PROXY`。
- 若健康检查里 `tg.reachable: false`，或搜索长期无 TG 源结果，在启动前设置合规代理，例如：

```bash
export PROXY=socks5://127.0.0.1:1080
./start-local.sh
```

代理需你自行准备；本指南不提供绕过或未授权访问手段。

- 插件源站偶发超时/失效属上游常态；网关失败时会回退演示并标明「演示模式」。

---

## 合规提醒

仅聚合公开分享链接元数据；不收集私有盘凭证；不提供提取码破解。

---

## 与 Cloud VM 的关系

开发与验证在 Agent VM 的 `/agent/panfind`、`/agent/pansou` 完成。因无 GitHub 凭据，**不能**保证有可 clone 的远程仓库；请以本页 tarball 为准在本机打开 localhost。
