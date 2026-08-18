# @deepseek-ai/dsh-tool-apppackage-validate

[English](README.md) | 中文

面向模型的应用包目录静态校验工具。工具通过 `ctx.fs` 读取一个应用包目录（契约见 [app-packages/README.md](../../../app-packages/README.md)），沙箱策略生效，返回结构化问题与派生出的跨应用依赖。

## 工具

`apppackage_validate(directory)` 校验：

- 包记录：`app.json` / `tenant.json` 是合法 JSON 对象且与目录名一致（`package.identifier`、`package.tenant`、`package.name`）。
- Entity：identifier 为小写 kebab-case 且与文件名一致、无重复 identifier、`fields` 数组的 `name`/`label` 非空、`type` 属于平台枚举、`unique`/`editable` 为布尔。
- 函数：`.js` body 与 `.meta.json` 侧文件配对、元信息 identifier 与文件名一致、`type` 属于 `static` / `object` / `constructor`、body 可用 `vm.Script` 编译；使用外部依赖词汇（`axios` / `ai` / `requireAdapter`）的函数标记"依赖人工处理"警告。
- 页面：顶层 `type: "page"`，并对照内置 Eureka `schema.json`（data/）完整校验。
- 菜单：数组结构、name 非空、页面挂载可解析。
- fixture 数据：记录是对象、键属于 Entity 字段，并按字段类型做数字/布尔/字符串检查。
- 跨应用依赖：Func body 中的 `getColl` / `__funcExecutor` 调用与页面 JSON 中的 `/app-package/entity/:identifier/...` URL，排除本应用包自身 identifier。

规范输出为 `{ ok, issues: [{ severity, file, rule, message }], dependencies: [{ identifier, kind, references }] }`；error 阻止发布，warning 需要审阅。

## 模型体验

工具描述指导模型在生成或编辑应用包之后、采纳或发布之前运行校验。终端渲染逐条列出 `[severity] file (rule) message` 与跨应用引用 `identifier (kind): references`。

## 已知局限与延后工作

- identifier 白名单检查目前只做外部依赖词汇检测；完整沙箱词汇强制由 M3 沙盒（`vm` 上下文注入）承担。
- 依赖提取基于正则；动态拼接的 identifier 由模型报告并交用户发布前确认。
- `data/eureka-schema.json` 是 Eureka `schema.json` 构建产物的内置快照；Eureka 升级后用 `pnpm --filter @deepseek-ai/dsh-tool-apppackage-validate sync:eureka-schema` 保持更新（`EUREKA_ROOT` 可覆盖检出路径）。
