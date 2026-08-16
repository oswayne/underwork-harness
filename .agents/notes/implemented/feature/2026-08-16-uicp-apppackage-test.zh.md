# Agent Note: UICP 应用包自动测试

Status: implemented

[English](2026-08-16-uicp-apppackage-test.md) | 中文

## 问题

M3 验收要求自动测试覆盖正例、反例与边界，不只快乐路径，在本地沙盒执行并把结构化结果喂给模型修复回路。没有工具，验证只能人工进行，无 key 的 CI 也无法验证生成的应用包。

## 决策

[`@deepseek-ai/dsh-tool-apppackage-test`](../../../../packages/uicp/tool-apppackage-test/README.md) 注册 `apppackage_test`：从应用包目录构建进程内沙盒（`loadPackage` + 基于 `MemoryKvBackend` 的 `SandboxStore` + `SandboxExecutor` + `SandboxRouter`），写入 fixture 数据，按 Entity/函数生成用例（CRUD、唯一重复、分页、`_preventListAll`、数字过滤、树形、静态/对象/构造函数、外部依赖词汇跳过），执行套件，并经 `ctx.fs` 把用例沉淀到 `tests/apppackage.cases.json`。规范输出为 `{ ok, cases, passed, failed, results }`。

沙盒包现在导出 `MemoryKvBackend` 与沙盒类供复用，`tsconfig.base.json` 为 `@deepseek-ai/dsh-sandbox-server` 增加显式路径条目（通配条目早于 `uicp/` 组嵌套，未覆盖新包）。

## 曾考虑的替代方案

- **通过真实 HTTP 驱动沙盒**——否决：进程内 router 调用走完全相同的 REST 语义且免去端口接线，工具保持无 key、封闭。
- **在工具包内手写 fixture 后端**——否决：`MemoryKvBackend` 属于沙盒，测试与工具复用同一实现。

## 结果

生成的应用包在采纳前获得自动化验证，沉淀的 `tests/apppackage.cases.json` 可审阅、可扩展。对真实平台的行为矩阵套件仍是 M4 保真闸门。
