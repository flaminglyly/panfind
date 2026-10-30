# 解压包强制校验（v0.3.3）

期望包：`media/panfind-v0.3.3.tgz`。size/sha 以 `media/panfind-local/run-v0.3.3.sh` 中 EXPECTED_* 为准。

```bash
grep -n '"version"' version.json package.json | head -10
grep -n 'cookieWeiboCom\|cookieForHost\|mWeiboConfigured' api/src/sources/weibo.js api/src/config/weibo-store.js | head -20
(cd api && npm test)
curl -s http://127.0.0.1:8787/api/health | python3 -c 'import sys,json;d=json.load(sys.stdin);assert d["version"]=="0.3.3";print(d["version"], d.get("weibo"))'
```
