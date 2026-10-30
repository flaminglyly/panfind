# 微博评论「网页链接」掩码与网盘提取（v0.3.2+；Cookie 分槽见 v0.3.3）

## 现象

资源博主常在**评论**里发网盘，UI 显示为：

- 明文：`K: https://pan.quark.cn/s/…` / `D: … 提取码:xxxx` / `UC: …` / `迅: …`
- 掩码：`K 网页链接` `D 网页链接` `U 网页链接`（大写单字母，**冒号可有可无**；`U`/`UC` → UC）

| 前缀 | 网盘 |
|------|------|
| `K` / `k` / `夸克` | 夸克 |
| `D` / `d` / `百度` | 百度 |
| `U` / `UC` / `uc` | UC（可选提取） |
| `迅` / `迅雷` | 迅雷 |

掩码时页面上看不到 `pan.*` 明文；链接在接口 JSON 的 `url_struct`（`long_url` / `ori_url` / `short_url`）或 `sinaurl?u=` 里。

## 根因回顾

| 版本 | 问题 |
|------|------|
| ≤0.3.0 | 评论只做明文正则，掩码抽不出链 |
| 0.3.1 | 有掩码解析，但评论常 **0 条**：只打 `m.weibo.cn/comments/hotflow`，且 `comments_count>0` 才请求；`searchblog`（weibo.com）成功时移动端评论接口常空/需另一套 Cookie |
| **0.3.2** | 优先 `weibo.com/ajax/statuses/buildComments`（与博主内搜同域 Cookie）；**始终尝试拉评论**（不依赖 `comments_count`）；失败再回退 hotflow；诊断带 endpoint / mid / HTTP |

## 如何验证（Mac）

1. 用最新包 `panfind-v0.3.3.tgz` + `run-v0.3.3.sh` 启动。
2. 「微博设置」：分别填 **weibo.com** 与 **m.weibo.cn** Cookie（见 [weibo-dual-cookie.md](./weibo-dual-cookie.md)）+ 资源博主 UID `7670876672`。
3. 搜索：**青与碧 04** 或 **锁爱游戏**。
4. 期望：`sourceStats.weibo.count > 0`，诊断里 **评论 > 0**；health `version` = `0.3.3`。
5. 若仍评论 0：看诊断「评论接口 … mid=… HTTP …」与 `requestUrls`（勿分享 Cookie）。

```bash
curl -s 'http://127.0.0.1:8787/api/health' | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("version"), d.get("weibo"))'
curl -s 'http://127.0.0.1:8787/api/search?kw=青与碧+04' \
  | python3 -c 'import sys,json;w=json.load(sys.stdin)["sourceStats"]["weibo"];d=w.get("detail")or{};print("count",w.get("count"),"posts",d.get("postsScanned"),"comments",d.get("commentsFetched"),"meta",(d.get("commentFetchMeta")or[None])[0])'
```
