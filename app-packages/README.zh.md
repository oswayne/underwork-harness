# 应用包目录契约（M1 冻结）

[English](README.md) | 中文

应用包目录是 dsh 与用户协作的桥头堡与唯一事实源：dsh 只在目录上生成与迭代，用户在此审阅与采纳；平台仅在目录被采纳后由 API 保存（保存是最后一步）。本契约按 2026-08-16 uicp-server 源码核对冻结，差异修正见下文。

## 目录结构

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

## 文件格式与命名

- JSON 均为 UTF-8、2 空格缩进、文件末尾恰好一个换行。
- 所有 identifier 小写 kebab-case（平台创建 Entity 时 `toLowerCase`）。
- 本地文件不含平台 `_id`；跨记录引用一律用 identifier（实体/函数/页面/菜单），由保存工具映射为平台 ObjectId。
- 字段类型枚举（平台 `Field.type`）：`文本` / `ObjectId` / `数字` / `对象` / `日期` / `日期时间` / `布尔`。

## 各文件规格

- `tenant.json`：仅记录 `identifier` / `name` / `available`，不复制租户配置；实际租户 ObjectId 来自 `GET /systemctl/tenant/list`。
- `app.json`：App 记录字段 `name` / `identifier` / `description` / `version` / `available` / `hidden` / `type` / `url` / `portable` / `category` / `runtime` / `requireRoles` / `requirePermissions`。
- `entities/<id>.json`：Schema 记录（`name` / `category` / `identifier` / `description` / `version` / `tree` / `extra`）+ 内嵌 `fields` 数组。平台侧字段是独立 Field 记录，保存时拆为 Schema + 字段两次写入（见映射表）。
- `funcs/<entity>/<func>.js`：Func body 纯 JS；仅允许沙箱内部词汇。`<func>.meta.json` 记录 `identifier` / `name` / `type`（static / object / constructor）/ `comment`。
- `pages/<id>.json`：Eureka 页面 JSON，顶层 `type: "page"`；组件 `api` 为 `[method:]url`，接口返回 `{ status, msg, data }`（status 0 成功）。
- `menus.json`：菜单记录数组（`name` / `group` / `path` / `icon` / `sort` / `hidden` / `requireRoles` / `requirePermissions`），每条可带 `page` 字段声明挂载的页面 identifier。
- `data/<id>.json`：fixture 记录数组；仅本地沙盒与人工验证使用，不随 API 保存写入平台。

## 沙箱词汇（Func body 白名单）

内部词汇：`getColl` / `ObjectId` / `dayjs` / `crypto` / `Buffer` / `Decimal` / `console` / `__env` / `__funcExecutor` / `reportError` / `reportService`，以及请求注入的 `body` / `query` / `session`。

外部依赖词汇（`axios` / `ai` / `requireAdapter` 等）：沙盒不注入、不支持、不 mock；使用这些词汇的函数标记"依赖人工处理"。

## 平台 API 映射（创建顺序）

| 产物 | 创建 API | 请求体要点 |
| --- | --- | --- |
| App | `POST /app-package` | app.json 字段 |
| Entity | `POST /app-package/entity` | Schema 字段 + `app`（App ObjectId） |
| 字段 | `POST /app-package/entity/field` | `entity`（Schema ObjectId）+ name/label/type/unique/editable/comment |
| Function | `POST /app-package/entity/func` | `entity`（Schema ObjectId）+ identifier/name/comment/body/type |
| Menu | `POST /app-package/menu` | `app` + name/group/path/icon/sort/hidden/requireRoles/requirePermissions |
| Page | `POST /app-package/menu/:id/page` | 请求体就是页面 JSON 本身 |
| 数据 | `POST /app-package/entity/:identifier` | 记录字段 |

更新用 `PATCH`（App `/app-package/:id`、Entity `/app-package/entity/:id`、字段 `/app-package/entity/field/:id`、函数 `/app-package/entity/func/:id`、菜单 `/app-package/menu/:id`、页面 `/app-package/menu/:id/page`）。

查询与执行：`GET /app-package/entity/:identifier/page|list`、`POST /app-package/entity/:identifier/func/:funcIdentifier`（static）、`POST /app-package/entity/:identifier/:id/func/:funcIdentifier`（object）。

## 与设计文档的差异修正

以下差异按 uicp-server 源码（2026-08-16）核对，修正 UPGRADE.md / IMPLEMENTATION.md 中的表述，待 M1 人工导入验证通过后回写设计文档：

1. App 领域对象没有 `trade` 字段（行业是 `category`）；文档 2.1 字段表含 `trade`，已从本契约移除。
2. `Schema.tree` 是布尔（数据树模式开关），不是字段结构；字段是独立 Field 记录（`POST /app-package/entity/field`）。目录以 `entities/<id>.json` 内嵌 `fields` 投影，保存时拆为 Schema + 字段两次写入。
3. Func 沙箱注入名是 `__funcExecutor`（设计文档写作 `executeFunc`，后者只是 `buildContext` 内部变量）。
4. Func 创建 API 的请求体用 `entity` 字段传 Schema id（设计文档未写明）。
5. Menu 是扁平记录（`group` / `name` / `path` / `icon` / `sort`），"菜单树"由 group/path 组织；Page 通过 `menu` 字段挂载。
6. Page 创建 API 的请求体是页面 JSON 本身（不是 `{ schema: ... }` 包装）。
7. `GET /app-package/menu/:id/page` 返回解析后的页面 JSON（不是 Page 记录包装）。
8. 线上历史页面 JSON 可能携带 `/lowcode/form/schema/...` 数据 URL（平台前端网关改写，直连 API 实测 404）；契约固定使用直连可用的 `/app-package/entity/...` 路径（实测 200）。

## 人工导入验证（M1 验收）

```sh
BASE_URL=<平台服务地址> JWT=<平台Token> TENANT_ID=<租户ObjectId> app-packages/import-example.sh
```

脚本按"App → Entity → 字段 → 函数 → 菜单 → 页面 → fixture 数据"顺序创建示例应用包，最后打印验证命令。平台侧人工走一遍快乐路径兜底：打开订单列表页、查询/新增/删除、执行订单汇总与标记完成函数。

脚本幂等：按 identifier/路径复用已有记录，只创建缺失项；fixture 仅在实体无数据时写入。如需从零重建，先删除整个 App（`DELETE /app-package/:id` 级联删除下属产物）。

## 上游同步手册

本地应用包契约依赖三个上游来源，按以下方式保持同步。

1. **Eureka 页面 schema**（`tool-apppackage-validate` 的 `data/eureka-schema.json`）：
   Eureka 升级后运行 `pnpm --filter @deepseek-ai/dsh-tool-apppackage-validate sync:eureka-schema`
   （`EUREKA_ROOT` 可覆盖检出路径），再重跑校验包测试；同步版本记录在
   `data/eureka-version.json`。
2. **页面 schema 差异**：当平台产出的页面无法通过 `apppackage_validate` 时，
   在 Eureka 检出目录 `doc/codex/YYYY-MM-DD-<主题>.md` 按既有报告格式存档，
   交由 Eureka 团队修复；修复后同步更新后的 schema 快照。
3. **平台行为差异**：用行为矩阵（`packages/uicp/contract-matrix`）对比平台，
   将差异反馈平台维护方；平台收敛前沙盒保持契约忠实。
4. **平台写入边界**：开发与验证阶段只允许在测试租户的 `dsh-test` 应用包内
   创建记录，绝不操作其他租户。
