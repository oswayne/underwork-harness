# uicp/ — UICP 低代码平台驱动器

[English](README.md) | 中文

UICP 低代码平台驱动器把 dsh 改造为 uicp 平台的生成驱动器：应用包目录是协作桥头堡与唯一事实源（契约见 [app-packages/README.md](../../app-packages/README.zh.md)），沙盒、发布、测试与版本工具都建立在它之上。

| 包 | 职责 | ctx key |
|---|---|---|
| [`tool-apppackage-validate/`](tool-apppackage-validate/README.zh.md) | 静态校验 + 动态跨应用依赖分析 | — |
| [`eureka-preview-host/`](eureka-preview-host/README.zh.md) | 自包含 Eureka 预览 bundle（React 19，无 iframe） | — |
| [`sandbox-server/`](sandbox-server/README.zh.md) | 本地数据沙盒：CRUD/查询/stats/树形 + 基于 vm 的函数执行（`ctx.storage`） | — |
| [`tool-apppackage-test/`](tool-apppackage-test/README.zh.md) | 自动测试执行器：生成用例跑本地沙盒 | — |
| [`tool-apppackage-version/`](tool-apppackage-version/README.zh.md) | 本地版本快照：列表 / 快照 / 恢复 | — |
| [`tool-apppackage-publish/`](tool-apppackage-publish/README.zh.md) | 采纳闸门 + 幂等 API 保存到平台 | — |
| [`contract-matrix/`](contract-matrix/README.zh.md) | 行为矩阵语料 + 双端差异执行器（M4 保真闸门） | — |
| [`user-identity/`](user-identity/README.zh.md) | 平台用户身份 seam：JWT → `/user/user/self`、缓存用户记录、追加式 JSONL 持久化（M5） | — |
| [`project-git/`](project-git/README.zh.md) | 按用户的 Git 项目工作区：创建即克隆 + 凭据安全的 askpass 注入（M5） | — |

设计与实现文档为 [UPGRADE.md](../../UPGRADE.md) 与 [IMPLEMENTATION.md](../../IMPLEMENTATION.md)。
