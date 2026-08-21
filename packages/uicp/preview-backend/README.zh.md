# @deepseek-ai/dsh-uicp-preview-backend

[English](README.md) | 中文

UICP 低代码驱动器的应用包预览 seam。该 host 插件提供自包含 eureka 预览/编辑器 bundle 及浏览器 UI 消费的应用包数据路由：页面/fixture 读取、带重新校验的编辑器写回、workspace 测试运行器、本地版本快照/恢复，以及采纳门控的发布 upsert。它还响应 `GET /uicp/preview/root`，返回从配置或进程 cwd 解析出的应用包根目录，浏览器无需壳提供路径。

## 路由

- `GET /uicp/editor` — 独立 eureka 编辑器窗口页面。
- `GET /uicp/preview/root` — 解析后的应用包根目录。
- `GET|POST /uicp/preview/page` — 页面 schema/fixture 读取与编辑器写回。
- `POST /uicp/preview/test` — 运行应用包测试套件。
- `POST /uicp/preview/version` — 快照、列出或恢复本地版本。
- `POST /uicp/preview/publish` — 采纳门控的平台 upsert。
- `GET /uicp/preview/entity/...` — 页面预览的沙盒数据查询。

## Model Experience

None，因为预览 seam 只服务浏览器/编辑器资源与沙盒数据路由；模型仅通过工具包到达它。

#### KV Cache effect

无；该 seam 既不组装也不发送 provider 请求。

## 已知局限与延后工作

- 独立编辑器以浏览器弹窗打开；弹窗拦截器会在编辑器座位显示错误。
