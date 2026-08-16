# Agent Note: UICP 本地沙盒

Status: implemented

[English](2026-08-16-uicp-local-sandbox.md) | 中文

## 问题

M3 需要本地执行环境，在用户采纳前验证生成的应用包：数据 CRUD、查询操作符、stats/树形与函数执行必须与平台行为一致。没有它，开发期预览会打到真实平台，自动测试也无法无 key 运行。

## 决策

[`@deepseek-ai/dsh-sandbox-server`](../../../../packages/uicp/sandbox-server/README.md) 是 host 插件，在 `ctx.webServer` 上提供与平台一致的 `/app-package/entity/...` REST 路径。store 按会话把记录持久化到 `ctx.storage` 的 KV facet（`backendName`，默认 `json`）；查询引擎镜像 `DataQueryApp` / `Field`（操作符、类型转换、`_sort`、`_preventListAll`、分页、stats、树形组装与分支前缀）；执行器在 vm 上下文运行 body，只注入内部词汇，并镜像构造函数生命周期语义；上传返回 mock。`packageDir` 是必填配置，指向应用包目录。

## 曾考虑的替代方案

- **开发期直接使用真实平台**——否决：会把测试数据写进平台、污染生产租户，且无法无 key 运行自动测试。
- **复用内存版 Mongo**——否决：沙盒镜像的是契约行为而非 Mongo 实现，且保持依赖树最小。
- **硬编码存储后端名**——否决：后端属于部署组合；`backendName` 是校验过的配置，缺 KV facet 时加载即失败。

## 结果

自动测试与页面预览可无 key 地跑在本地镜像上；对真实平台基准的行为矩阵契约测试仍是 M4 保真闸门。沙盒仅用于开发期，永不是生产路径。
