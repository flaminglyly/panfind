# 微博双 Cookie 槽（v0.3.3）

## 为什么要两个

| 接口 | 域名 | 配置槽 |
|------|------|--------|
| 博主内搜 `searchblog`、评论 `buildComments` | **weibo.com** | `cookieWeiboCom` |
| 关键词公开检索 `getIndex`、评论回退 `hotflow` | **m.weibo.cn** | `cookieMWeibo` |

只粘贴 weibo.com 的 Cookie 去打 m.weibo.cn，常得到 **ok=-100**（要登录）。两处登录态不同，需分别打开站点再复制。

## 怎么填

1. 打开「微博设置」。
2. **weibo.com Cookie**：浏览器打开 https://weibo.com 并登录 → F12 → Network → 任意请求 → 复制 Request Headers 的 `Cookie` → 粘贴到第一框 → 保存。
3. **m.weibo.cn Cookie**：打开 https://m.weibo.cn 并登录（可扫码）→ 同样复制 Cookie → 粘贴到第二框 → 保存。
4. 健康条应显示：`weibo.com Cookie 有 · m.weibo.cn Cookie 有`（只显示有/无，不回传明文）。

兼容：旧单字段 `cookie` / 环境变量 `WEIBO_COOKIE` 在分槽为空时仍会回填两边。可选 `WEIBO_COOKIE_COM` / `WEIBO_COOKIE_M`。

## 验证

```bash
curl -s http://127.0.0.1:8787/api/health | python3 -c 'import sys,json;w=json.load(sys.stdin).get("weibo")or{};print(w.get("weiboComConfigured"), w.get("mWeiboConfigured"), w.get("searchMode"))'
curl -s 'http://127.0.0.1:8787/api/config/weibo' | python3 -c 'import sys,json;c=json.load(sys.stdin)["config"];print(c.get("weiboComConfigured"), c.get("mWeiboConfigured"), c.get("cookieHint"))'
```

无博主 UID、只有 weibo.com Cookie 时搜关键词：应提示填写 **m.weibo.cn Cookie** 槽，而不是含糊的 ok=-100。
