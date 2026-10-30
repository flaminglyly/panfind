# 微博搜索源（盘搜扩展）

## 做什么

按关键词检索微博**公开**内容，从**正文 + 热评**（及长文 / `url_struct` / `url_objects`）提取百度 / 夸克 / 迅雷公开分享链接与提取码，并入盘搜结果列表。

- 来源标记：`source` = `weibo:{uid}`（演示为 `weibo:demo:…`）
- 结果额外字段：`weiboNick` / `weiboUid` / `weiboMid` / `weiboPostUrl` / `weiboLinkOk` / `origin:"weibo"`
- UI「微博来源」行：昵称、UID、source；**仅** `weiboLinkOk` 时提供「打开微博」
- **演示夹具**：不生成假 `weibo.com/u/…`（会「用户不存在」），标「演示·不可跳转」并禁用跳转
- **实时结果**：用接口返回的 `uid` + `mblogid`（或 `mid` → `m.weibo.cn/detail/{mid}`）拼链
- **评论掩码**：UI「网页链接」+ 前缀 `k`/`d`/`uc`/`迅` → 见 [weibo-comment-links.md](./weibo-comment-links.md)

与 PanSou、混合盘系并行聚合、去重排序。

### 检索模式

| 条件 | 行为 |
|------|------|
| 已设 Cookie + 博主 UID | 在指定资源博主主页内按关键词搜博文 |
| 已设 Cookie、**未设** UID | **关键词公开检索**（m.weibo.cn 综合搜索） |
| 无 Cookie 且开启演示 | 返回标注演示夹具 |
| 无 Cookie 且未开演示 | 该源跳过 |

## 产品内配置（推荐）

打开 Web 右上角 **「微博设置」**：

1. 开关「启用微博源」
2. 分别粘贴 **weibo.com Cookie** 与 **m.weibo.cn Cookie** → 保存（写入本机 `panfind/.data/weibo-config.json`，**已 gitignore**，API 不回传明文）。详见 [weibo-dual-cookie.md](./weibo-dual-cookie.md)
3. 增删改资源博主 UID / 备注昵称（可空 → 关键词公开检索，需 m.weibo.cn Cookie）
4. 可选：无 Cookie 演示夹具、热评、页数

持久化：

| 层 | 内容 |
|----|------|
| 服务端 `.data/weibo-config.json` | 权威配置（含 Cookie），权限 0600 |
| `localStorage` `panfind.weibo.draft` | 开关 / 博主列表草稿（**不含** Cookie） |

API：

- `GET /api/config/weibo` → 脱敏视图
- `PUT /api/config/weibo` → `{ enabled, cookie?, bloggers?, allowDemo?, … }`

## 环境变量（可选 / CI）

产品内配置优先于环境变量。

| 变量 | 必填 | 说明 |
|------|------|------|
| `ENABLE_WEIBO` | 文件未设时 | `1` 开启 |
| `WEIBO_COOKIE` | 实时可选 | 用户自备；面板保存后优先生效 |
| `WEIBO_UIDS` | 可选 | 逗号分隔；面板 `bloggers` 优先生效 |
| `WEIBO_FETCH_COMMENTS` | 否 | 默认 `1` |
| `WEIBO_MAX_PAGES` | 否 | 默认 `2` |
| `WEIBO_ALLOW_DEMO` | 否 | 无 Cookie 演示 |
| `WEIBO_CONFIG_PATH` | 否 | 覆盖默认配置文件路径 |

### 获取 Cookie（用户自备）

1. 浏览器登录微博（建议能访问 m.weibo.cn）。
2. F12 → Network → 复制 Request Headers 中的 `Cookie`。
3. 粘贴到「微博设置」并保存（或 `export WEIBO_COOKIE=…`）。

Cookie 会过期，需自行更新。勿分享含 Cookie 的日志或提交 git。

## 合规边界

- 仅处理公开检索接口返回的内容。
- **不提供**账号破解、验证码绕过、限流破解、未授权访问。
- Cookie 须用户自行登录后复制；盘搜不代扫码、不代保管密码明文到仓库。

## 如何用（冒烟）

```bash
# 面板或 API 开启演示
curl -X PUT http://127.0.0.1:8787/api/config/weibo \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true,"allowDemo":true,"bloggers":[{"uid":"10001","nick":"资源菌Demo"}]}'

# 搜索，检查 results[].weiboNick / weiboUid / weiboPostUrl / source
curl -s 'http://127.0.0.1:8787/api/search?kw=三体' | head -c 600
```

浏览器：http://localhost:5173 →「微博设置」→ 搜「三体」→ 结果应出现红色「微博来源」行。

推荐实测：关键词「锁爱游戏」+ UID `7670876672`（需有效 Cookie）→ 见 [weibo-comment-links.md](./weibo-comment-links.md)。

## 实时 0 条？

见 [weibo-live-debug.md](./weibo-live-debug.md)。搜索响应 `sourceStats.weibo.error` / UI「微博源」诊断条会显示原因（如 ok=-100）；请求 URL 不含 Cookie。有帖无链时可能附带评论样例。

## 限制

- 实时检索需有效 Cookie；不做匿名爬取 / 登录墙绕过 / 限流破解。
- 关键词公开检索受微博风控影响，可能空结果。
- 配置文件仅本机；多机部署需各自配置或挂载共享（注意 Cookie 敏感）。
