# Agent Note: UICP 应用包目录契约

Status: implemented

[English](2026-08-16-uicp-app-package-directory-contract.md) | 中文

## 问题

UICP 桌面驱动器方案把本地应用包目录作为 dsh 与用户协作的桥头堡与唯一事实源，但设计文档按记录层面描述平台契约，对若干承重细节表述不精确：Entity 字段是否内嵌在 Schema 记录中、各创建 API 的请求体是什么、Func 沙箱注入的名称是什么。M1 冻结目录契约与一个具体示例包，使后续工具（校验、保存、沙盒、测试）建立在一个已验证的映射上，而不是在实现时重新发现平台契约。

## 决策

契约位于 [app-packages/README.md](../../../../app-packages/README.zh.md)，示例位于 `app-packages/cszh/dsh-test/`（测试租户 `cszh`、App `dsh` / `dsh-test`、1 个 Entity、2 个函数、1 个列表页、1 个菜单挂载、fixture 数据）。本地记录之间只用 identifier 引用，绝不携带平台 ObjectId；保存工具在发布时把 identifier 映射为 ObjectId。Entity 文件把字段以 `fields` 数组内嵌，尽管平台把字段存为独立记录；每个函数把 `.js` body 与 `.meta.json` 侧文件配对（`identifier` / `name` / `type` / `comment`）。菜单是扁平记录，带可选的 `page` 挂载引用。

契约记录了六处经源码核对的、对设计文档的修正：App 领域对象没有 `trade` 字段（行业是 `category`）；`Schema.tree` 是布尔数据树开关，不是字段结构；Func 沙箱注入的是 `__funcExecutor`（不是 `executeFunc`）；Func 创建 API 以 `entity` 传 schema id；菜单记录是扁平的；Page 创建 API 的请求体就是页面 JSON 本身。

```text
app-packages/<tenant-identifier>/<app-identifier>/
  tenant.json
  app.json
  entities/<entity-identifier>.json
  funcs/<entity-identifier>/<func-identifier>.js
  funcs/<entity-identifier>/<func-identifier>.meta.json
  pages/<page-identifier>.json
  menus.json
  data/<entity-identifier>.json
  tests/
  versions/
```

可重复执行的导入脚本（[app-packages/import-example.sh](../../../../app-packages/import-example.sh)）按创建顺序通过平台 API 创建示例并打印验证命令；页面 JSON 已按 Eureka `schema.json` 校验（schema 要求处为 `additionalProperties: false`）。

## 曾考虑的替代方案

- **每个字段一个文件**——否决：目录会把一个审阅单元拆散到大量小文件；把 `fields` 内嵌在 Entity JSON 中让审阅集中在一处，保存时的拆分只是机械映射。
- **本地文件携带平台 ObjectId**——否决：id 在发布前不存在且随环境不同；用 identifier 引用保持目录可移植、可 diff、可审阅。
- **函数元信息写在 `.js` body 的头部注释里**——否决：解析注释不可靠，body 必须保持为纯平台沙箱脚本；`.meta.json` 侧文件显式且可检查。
- **从零编写极简页面而不是跟随平台 CRUD 模板**——否决：平台自己生成的 `PageTemplate.js` 结构已知满足 Eureka schema，因此示例镜像该结构，只替换实体相关的列、API 与表单。

## 结果

M2 与 M3 工具（校验、保存、沙盒、自动测试）基于本契约构建；沙箱词汇白名单现在写的是 `__funcExecutor`；示例包为人工导入验证提供了具体对象；修正项留在契约 README 中，待平台人工导入通过后回写 UPGRADE.md / IMPLEMENTATION.md。`tests/` 与 `versions/` 预留给 M3。契约有意不包含平台的 `trade` 字段，并记录设计文档曾有该字段。
