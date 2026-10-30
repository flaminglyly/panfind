# 微博链接修复说明

## 问题
演示夹具曾用 `https://weibo.com/u/10001` 等假 UID，点击出现「用户不存在」。

## 修复
1. **演示**：`weiboPostUrl` 为空，`weiboLinkOk=false`，UI 显示「演示·不可跳转」，不渲染 `<a>` / 复制微博链。
2. **实时**：仅用接口字段拼链——优先 `https://weibo.com/{uid}/{mblogid}`，否则 `https://m.weibo.cn/detail/{mid}`；缺字段则不可跳转。

配置 Cookie 后重新搜索即可得到可打开的真实帖链接。
