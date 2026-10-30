# 微博实时检索：0 结果排查

## 根因（常见）

1. **演示 → 实时切换**：无 Cookie 时 `allowDemo` 返回夹具；一旦保存 Cookie，**不再混入演示**，只走实时接口。
2. **错误曾被静默**：博主 UID 搜索失败或关键词 `ok=-100` 时，错误只落在内部 `errors[]`，UI/外层 `sourceStats.weibo.error` 为空，表现为「0 条」。
3. **截图种子 UID**：设置里若残留 `10001` 等占位 UID，有 Cookie 后会强制「博主内搜」；假 UID 失败后以前不回退关键词。
4. **Cookie 域名（v0.3.3 双槽）**：关键词检索请求 `m.weibo.cn`，需填「m.weibo.cn Cookie」槽。仅有 weibo.com Cookie 时会明确提示缺移动端槽，不再误用 PC Cookie 打移动端（否则常 **ok=-100**）。
5. **有帖无盘链**：网页能搜到关键词 ≠ 已抽出百度/夸克/迅雷链。旧版只扫明文 `pan.*`，会漏掉评论里的「网页链接」掩码（见 [weibo-comment-links.md](./weibo-comment-links.md)）。
6. **扫帖>0 但评论 0（v0.3.1 常见）**：只请求 `m.weibo.cn/comments/hotflow`，且要求 `comments_count>0`。博主内搜走 `weibo.com` Cookie 时移动端评论常空。**v0.3.2** 改优先 `weibo.com/ajax/statuses/buildComments`，并始终尝试拉评论。

## 修复（本版）

- 实时失败写入 `sourceStats.weibo.error` / `warning`，并带 `detail.requestUrls`（**不含 Cookie**）、`okCode`、`postsScanned`、`commentFetchMeta`、可选 `commentSamples`。
- UI 展示「微博源」诊断条（含评论接口 / mid / HTTP）。
- 占位 UID `10001`/`10002` 自动忽略；UID 模式 0 帖/全失败时 **回退关键词检索**。
- **v0.3.2**：PC `buildComments` + 不依赖 `comments_count`；前缀大写 `K`/`D`/`U`。

## 自检（勿打印 Cookie）

```bash
curl -s 'http://127.0.0.1:8787/api/search?kw=锁爱游戏' \
  | python3 -c 'import sys,json;w=json.load(sys.stdin)["sourceStats"]["weibo"];d=w.get("detail")or{};print(w.get("error"), w.get("warning"), d.get("okCode"), d.get("searchMode"), d.get("postsScanned"), d.get("commentSamples"))'
```

期望：无效 Cookie → `error` 含 `ok=-100`；有效 Cookie 且有盘链 → `count>0`；有效但无盘链 → `warning` 含「未提取到」及可选评论样例。
