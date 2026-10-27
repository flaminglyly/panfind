# 盘搜（PanFind）

PC 浏览器 MVP：聚合 **百度网盘 / 夸克网盘 / 迅雷网盘** 的**公开分享链接**，按「源质量 + 关键词匹配 + 新鲜度」排序。

架构：**多源元搜索聚合（PanSou 范式）**。薄网关 + PC Web，对接本机 [fish2018/pansou](https://github.com/fish2018/pansou)（MIT）。上游失败回退演示；健康检查与 UI 标明「实时」或「演示」。

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

Project **无 GitHub 推送凭据**，请用可移植包：

- 文档：[`docs/local-run.md`](file:///cursor/stores/self/docs/local-run.md)（协调人侧路径见该文件）
- 包：`/cursor/stores/self/media/panfind-local/panfind-stack.tgz`

解压后目录应含 `panfind/`、`pansou/`、`start-local.sh`。

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
├── api/                 # Express 搜索网关
├── web/                 # Vite + React
├── scripts/
│   ├── start-local.sh   # 本机一键（PanSou+API+Web）
│   ├── run-live.sh
│   ├── run-all-live.sh
│   └── capture-live.mjs
└── README.md
# 并列：
pansou/                  # 上游源码 + run-live.sh
```

---

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `PORT` | 盘搜 API 端口 | `8787` |
| `PANSOU_URL` | PanSou 根地址 | 空 → 演示 |
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

## 合规说明

仅聚合公开分享链接元数据；不收集私有盘凭证；不提供提取码破解。结果指向第三方，请自行确认版权与有效性。

---

## 许可证

应用代码 MIT 兼容；上游 PanSou 为 MIT。
