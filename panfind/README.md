# 盘搜（PanFind）

PC 浏览器 MVP：聚合 **百度网盘 / 夸克网盘 / 迅雷网盘** 的**公开分享链接**，按「源质量 + 关键词匹配 + 新鲜度」排序。

架构：**多源元搜索聚合**。薄网关并行查询：

1. 本机 [PanSou](https://github.com/fish2018/pansou)（MIT）
2. **混合盘系公开 API**（hunhepan / qkpanso / kuake8 / misoso，自研适配器）
3. **微博**（可选：`ENABLE_WEIBO` + 自备 `WEIBO_COOKIE`；`WEIBO_UIDS` 可选，空则关键词公开检索）

去重后按匹配质量排序；UI 标明 `source`（如 `tg:…` / `plugin:…` / `ext:hunhepan` / `weibo:…`）。上游失败可回退演示。详见 `docs/multi-source.md`、`docs/weibo-source.md`。

---

## 在你自己的电脑上打开（推荐）

目标浏览器地址：**http://localhost:5173**

### 前提（macOS / Linux；Windows 用 WSL2）

| 依赖 | 版本 |
|------|------|
| Node.js | ≥ 18（推荐 20/22 LTS） |
| Go | ≥ 1.22（推荐 1.25） |
| curl | 任意 |

### 获取代码

目标仓库：**https://github.com/flaminglyly/panfind**（默认分支 `main`）。

Cloud Agent VM **无 `gh` 登录**，不能代推。请在你已登录的本机用 tarball 创建并推送（命令见 Project `docs/local-run.md`），或：

- 包：`/cursor/stores/self/media/panfind-local/panfind-stack.tgz`
- 解压后应含 `panfind/`、`pansou/`、`start-local.sh`、`scripts/push-github.sh`

### 若编译报 `pansou/util/cache is not in std`

旧包误排除了 `util/cache`。在已有目录修复（不必重下）：

```bash
cd pansou
curl -sL https://github.com/fish2018/pansou/archive/refs/heads/main.tar.gz | tar -xz -C /tmp
rm -rf util/cache && cp -R /tmp/pansou-main/util/cache util/
GO111MODULE=on go mod download && CGO_ENABLED=0 go build -o pansou .
cd .. && ./start-local.sh
```

### 三步 / 一键

```bash
cd /path/to/panfind-stack
chmod +x start-local.sh panfind/scripts/start-local.sh pansou/run-live.sh
./start-local.sh
```


然后打开 **http://localhost:5173**。应显示「实时聚合（PanSou）」。`Ctrl+C` 停止。

| 服务 | 地址 |
|------|------|
| Web | http://localhost:5173 |
| API | http://localhost:8787 |
| PanSou | http://localhost:8888 |

分步与代理说明见包内 `README-LOCAL.md` 与 Project `docs/local-run.md`。

若 TG 被拦截：`export PROXY=socks5://127.0.0.1:1080` 后再启动（需自备合规代理）。

---

## Cloud VM 内开发状态

路径：`/agent/panfind` + `/agent/pansou`。实时模式已在本 VM 验证（TG 无代理可达）。

```bash
# PanSou
cd /agent/pansou && ./run-live.sh

# 盘搜（或使用一键）
cd /agent/panfind
./scripts/start-local.sh
# 或：
# PANSOU_URL=http://127.0.0.1:8888 DEMO_MODE=0 npm run dev
```

演示模式：`DEMO_MODE=1 npm run dev:api`

---

## 目录

```
panfind/
├── api/                 # Express 搜索网关（含 weibo / extract / aggregate）
├── web/                 # Vite + React
├── docs/
│   ├── multi-source.md
│   └── weibo-source.md  # Cookie/UID 配置与合规说明
├── scripts/
│   ├── start-local.sh   # 本机一键（PanSou+API+Web；透传 WEIBO_*）
│   ├── run-live.sh
│   ├── run-all-live.sh
│   ├── capture-live.mjs
│   └── capture-weibo.mjs
└── README.md
# 并列：
pansou/                  # 上游源码 + run-live.sh
```

---

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `PORT` | 盘搜 API 端口 | `8787` |
| `PANSOU_URL` | PanSou 根地址 | 空则仅用扩展源/演示 |
| `ENABLE_EXT_SOURCES` | `1` 启用混合盘系扩展源 | `1` |
| `ENABLE_WEIBO` / 设置面板 | 启用微博源（面板优先） | 关 |
| `WEIBO_COOKIE` / 面板 Cookie | 实时 Cookie；面板写入 `.data/weibo-config.json` | 空 |
| `WEIBO_UIDS` / 面板博主列表 | 可选；空=关键词公开检索 | 空 |
| `WEIBO_ALLOW_DEMO` | 无 Cookie 时用 `weibo:demo` 夹具 | 关 |
| `DEMO_MODE` | `1` 强制演示 | `0` |
| `PANSOU_DIR` | pansou 目录（一键脚本） | 与 panfind 并列的 `../pansou` |
| `CHANNELS` / `ENABLED_PLUGINS` | PanSou 源 | 见 `pansou/run-live.sh` |
| `PROXY` | PanSou SOCKS5（可选） | 无 |

---

## API

- `GET /api/health` → `demoMode` / `liveReady` / `modeLabel`
- `GET|POST /api/search` → `kw`、`cloud_types=baidu,quark,xunlei`
- 前端深链：`/?kw=三体`

---

## 版本

当前 **v0.3.0**（`version.json`）。页脚 /「关于」可查看；API：`/api/health`（`version`、`buildTime`）、`/api/version`、`/api/changelog`。详见 `docs/version.md`。

## 微博设置

Web 右上角「微博设置」可开关微博源、粘贴 Cookie、增删资源博主；写入 `.data/weibo-config.json`（gitignore，Cookie 不入库）。结果卡片展示微博昵称 / UID / 帖子链接 / `source`。详见 `docs/weibo-source.md`。

## 合规说明

仅聚合公开分享链接元数据；不收集私有盘凭证；不提供提取码破解。结果指向第三方，请自行确认版权与有效性。

---

## 许可证

应用代码 MIT 兼容；上游 PanSou 为 MIT。
