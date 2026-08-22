# @deepseek-ai/dsh-client-ui-apppackage-workspace

[English](README.md) | 中文

UICP 低代码驱动器的应用包产品工作区。该 client 插件通过负优先级单槽替换上游 details 座位，提供带标签页的工作区：渲染预览、eureka 可视化编辑器（在独立浏览器窗口打开）、原始 JSON 编辑、自动化测试与本地版本管理。

## 标签页

- **预览** — 通过自包含 eureka 预览 bundle 与会话 fixture 数据渲染当前页面 JSON。
- **编辑** — 打开独立 eureka 编辑器窗口（`/uicp/editor`）进行可视化页面编辑，支持写回与重新校验。
- **JSON** — 文本级页面编辑，带保存与校验反馈。
- **测试** — 针对本地沙盒运行生成的应用包测试套件。
- **版本** — 快照、列出与恢复本地版本。

## Model Experience

None，因为本插件为浏览器界面，不触及任何模型请求。

#### KV Cache effect

无；本插件既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- 该 workspace 依赖同一个本地 `dsh web` 提供预览与沙盒 seam；缺少这些路由的独立部署会在预览与测试标签页报错。
- 编辑标签页打开独立浏览器窗口并依赖构建后的预览 bundle；它不内嵌在会话面板中。
