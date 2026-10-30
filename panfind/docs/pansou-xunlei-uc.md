# 为何迅雷 / UC 多出自微博？（v0.3.8）

## 结论（短）

| 源 | 迅雷 | UC |
|----|------|-----|
| **微博** | 常见（评论前缀「迅」等） | 常见（前缀 U/UC） |
| **混合盘系** | 有但稀少（`disk_type=XUNLEI`）；夸克镜像占多数 | **上游几乎不收录**（未见 `UC` 类型） |
| **PanSou** | 依赖插件 + TG 频道；**未设 `ENABLED_PLUGINS` 时插件数=0**，只剩默认 TG，迅雷/UC 极少 | 同上；需含 `yunpanuc` / `ucwpzy` 等频道或会出 UC 的插件 |

## 本地可修

1. **启动脚本**（0.3.8）：默认设置 `ENABLED_PLUGINS`（如 labi,zhizhen,shandian,duoduo,muou,haisou,sdso）并补充迅雷/UC 相关 TG 频道。  
2. **适配器**：合并结果时按 URL/别名识别迅雷/UC；`sourceStats` 显示各源分型与「该源无迅雷/UC」提示。

## 无法单靠盘搜修好的部分

混合盘公开 API 本身很少（或没有）UC；夸克专用镜像（如 qkpanso）只会返回夸克。微博仍是 UC/迅雷的主要公开来源之一。
