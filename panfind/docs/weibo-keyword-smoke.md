# 微博关键词检索 — 冒烟说明

## 无 Cookie（演示）

```bash
export ENABLE_WEIBO=1 WEIBO_ALLOW_DEMO=1
# 不设 WEIBO_UIDS、不设 WEIBO_COOKIE
curl -s 'http://127.0.0.1:8787/api/health' | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("weibo") or d)'
curl -s 'http://127.0.0.1:8787/api/search?kw=三体&enable_weibo=1' | python3 -c 'import sys,json;d=json.load(sys.stdin);items=d.get("items")or d.get("results")or[];w=[i for i in items if "weibo" in str(i.get("source",""))];print("weibo",len(w),"total",len(items), "sample", [(x.get("source"),x.get("url")) for x in w[:3]])'
```

期望：`weibo.searchMode=demo`；结果含 `weibo:demo:…`。

## 有 Cookie、无 UID（关键词公开检索）

```bash
export ENABLE_WEIBO=1
export WEIBO_COOKIE='SUB=...; SUBP=...'
# 故意不设 WEIBO_UIDS
curl -s 'http://127.0.0.1:8787/api/health'  # weibo.searchMode 应为 keyword
curl -s 'http://127.0.0.1:8787/api/search?kw=三体&enable_weibo=1'
# sourceStats.weibo.detail.searchMode === "keyword"
```

上游风控/Cookie 失效时该源可能为 0 条或 errors 非空；不破解限流。
