# 盘搜多源聚合说明

## 调研摘要（许可证 / 可接入性）

| 项目 | 许可证 | 形态 | 接入结论 |
|------|--------|------|----------|
| [fish2018/pansou](https://github.com/fish2018/pansou) | **MIT** | Go 搜索 API | **主源**，已接入 |
| [wu529778790/panhub…](https://github.com/wu529778790/panhub.shenzjd.com) | PolyForm **Noncommercial** | Nuxt 前端+插件 | **不作产品底座**；同范式参考 UI |
| joyce677/panhub、huanyu-a/panseek | 未标明清晰 OSI 许可 | 前端聚合 | 仅作技术对照，不 vendoring |
| cloudlink-finder | 未核实 | 探活/搜索增强 | 可选二期；非本版依赖 |
| 混合盘系公开 API（hunhepan / qkpanso / kuake8 / misoso） | 公开 HTTP 接口 | 与 pansou `hunhepan` 插件同源 | **自研 MIT 适配器接入**（不复制 NC 前端） |

## 本版实现

网关并行：

1. **PanSou**（`PANSOU_URL`）
2. **混合盘系**（`ENABLE_EXT_SOURCES=1`，默认开）→ `ext:hunhepan` / `ext:qkpanso` / …
3. **微博**（`ENABLE_WEIBO=1` + 自备 Cookie；UID 可选）→ `weibo:{uid}`；无 UID 时关键词公开检索。详见 [weibo-source.md](./weibo-source.md)

统一：URL 规范化去重 → 源质量+关键词+新鲜度打分 → 返回最多 120 条；UI 展示 `source`。

环境变量：

| 变量 | 说明 |
|------|------|
| `PANSOU_URL` | PanSou 根地址 |
| `ENABLE_EXT_SOURCES` | `1`/`0` 开关混合盘系 |
| `ENABLE_WEIBO` / `WEIBO_COOKIE` / `WEIBO_UIDS`(可选) | 微博源：无 UID 时关键词公开检索（见 weibo-source.md） |
| `DEMO_MODE` | 强制演示 |

单次请求可覆盖：`?enable_ext=0`、`?enable_weibo=0` 便于对比。

## 合规

仅公开分享元数据；无私有凭证；无提取码破解。微博 Cookie 由用户自备，不破解登录。源站可能屏蔽部分关键词，属上游策略。
