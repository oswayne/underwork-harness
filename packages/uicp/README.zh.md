# uicp/ — UICP 低代码平台驱动器

[English](README.md) | 中文

UICP 低代码平台驱动器把 dsh 改造为 uicp 平台的生成驱动器：应用包目录是协作桥头堡与唯一事实源（契约见 [app-packages/README.md](../../app-packages/README.md)），沙盒、发布、测试与版本工具都建立在它之上。

| 包 | 职责 | ctx key |
|---|---|---|
| [`tool-apppackage-validate/`](tool-apppackage-validate/README.md) | 静态校验 + 动态跨应用依赖分析 | — |
| [`eureka-preview-host/`](eureka-preview-host/README.md) | 自包含 Eureka 预览 bundle（React 19，无 iframe） | — |
| [`sandbox-server/`](sandbox-server/README.md) | 本地数据沙盒：CRUD/查询/stats/树形 + 基于 vm 的函数执行（`ctx.storage`） | — |
| [`tool-apppackage-test/`](tool-apppackage-test/README.md) | 自动测试执行器：生成用例跑本地沙盒 | — |

设计与实现文档为 [UPGRADE.md](../../UPGRADE.md) 与 [IMPLEMENTATION.md](../../IMPLEMENTATION.md)。
