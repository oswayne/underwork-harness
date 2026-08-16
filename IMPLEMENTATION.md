# dsh 低代码平台驱动器——开发落地实现文档

> 状态：基于 [UPGRADE.md](UPGRADE.md)（预定稿）的实现指导；本文档中的技术断言均经代码调研验证（2026-08-16）；未配对工作文档，不进入 docs/ 站点。
> 标记约定：【已验证】= 经代码核实的事实（附代码位置）；【实现要点】= 基于已验证机制的落地做法；【验收】= 里程碑验收标准。

## 0. 文档定位

- 与方案的关系：UPGRADE.md 定义"做什么与决策"（D1–D22），本文档定义"怎么做"（架构、规格、任务、验收）。
- 阅读对象：实现工程师与开发 agent；按里程碑（M0–M4）推进，技术规格按模块查阅。
- 范围：dsh 改造为低代码平台桌面版生成驱动器，含壳、UI 集成、本地沙盒、校验/测试、API 保存、上游同步。

## 1. 实现总览

### 1.1 目标架构

```text
Tauri 壳（macOS / Windows，未来 Linux）
  ├─ 拉起并守护 dsh 本地进程（sidecar，localhost HTTP）
  ├─ 原生桥面：凭证存储（Keychain/DPAPI）、Passkey（可选）、托盘/通知、外链
  └─ 嵌入式 webview → http://127.0.0.1:<port>

一个本地 HTTP 服务三合一（D19）
  ├─ dsh Web UI（基于 dsh Web UI + 最小改造，D18）
  │    ├─ 新增 client 插件：登录、租户/应用包/会话导航、会话头切换、产物工作区、eureka 预览/编辑
  │    └─ 适配层 our-ui/adapter（上游 import 收口）
  ├─ RPC（/api）+ 事件流（WS downlink）——UI ↔ 核心
  └─ 沙盒 API（/app-package/entity/...）——eureka 页面本地预览的数据源
```

### 1.2 组件地图

| 类别 | 新增组件 | 落点 | 对应章节 |
| --- | --- | --- | --- |
| host 插件 | 沙盒服务器（路由 + 数据 + 查询 + 函数执行） | `packages/uicp/sandbox-server`（新包） | 4 |
| host 插件 | 会话删除与沙盒数据清理 RPC | 同上或独立小包 | 4.6 / 10 |
| tool 包 | 校验与动态依赖分析 | `packages/uicp/tool-apppackage-validate` | 5 |
| tool 包 | 自动测试执行器 | `packages/uicp/tool-apppackage-test` | 6 |
| tool 包 | API 保存（逐记录 upsert） | `packages/uicp/tool-apppackage-publish` | 7 |
| tool 包 | 版本管理（快照/切换/回滚） | `packages/uicp/tool-apppackage-version` | 9 |
| client 插件 | 登录、导航、会话切换、产物工作区、eureka 视图 | `packages/client/ui-uicp-*`（新包） | 8 |
| 配置层 | agent preset（交付物 = AppPackage） | `apps/cli/config/agent-presets/uicp/` | 8.4 |
| 配置层 | skill（平台契约词汇） | `packages/skill/*` 或独立 skill 包 | 8.4 |
| 壳工程 | Tauri v2 桌面壳 | 仓库外独立工程（如 `desktop/`） | 11 |
| 上游同步 | 共享文件补丁 + 适配层脚本 | `scripts/uicp-*` | 12 |

**host 组成（保留的 dsh 包）**：core（agent、agent-loop、session、system-prompt、tools、scope）、session 持久化、fs、subprocess/shell、credentials、jobs、app-boot/boot、webserver、connection（host 半）、dsh Web UI 栈（apps/web、client 包、frontend-static）、沙盒（自研 host 插件）。

### 1.3 里程碑总览

| 里程碑 | 目标 | 本文档章节 |
| --- | --- | --- |
| M0 | 壳 + dsh Web UI 加载 + JWT 登录 + 租户/应用包/会话导航 | 8 / 10 / 11 |
| M1 | 应用包目录契约冻结 + 示例应用包 | 3 |
| M2 | 知识注入 + 校验 + eureka 预览 | 8.2 / 8.4 / 5 |
| M3 | 沙盒 + 编辑器 + 自动测试 + 版本 + API 保存（完整闭环） | 4 / 6 / 7 / 9 |
| M4 | 契约保真、快照测试、版本同步脚本、打包分发 | 4.7 / 11 / 12 |

### 1.4 决策溯源（UPGRADE.md D1–D22 → 实现章节）

| 决策 | 实现章节 |
| --- | --- |
| D1 文件桥头堡 + 采纳后 API 保存 | 3 / 7 |
| D2 构造函数（落库前钩子） | 2.2 / 4.4 / 6 |
| D3 内嵌 eureka 预览 + eureka-editor | 8.2 / 14（M2） |
| D4 知识注入（preset + skill） | 8.4 |
| D5 Token 自动恢复 + 失效重输 | 11.3 / 14（M0） |
| D6 认证（JWT 主路径，Passkey 可选） | 2.5 / 11.3 |
| D7 桌面壳 Tauri v2 | 11 |
| D8 租户 → 应用包 → 会话 | 8.2 / 8.3 / 10 |
| D10 沙盒镜像 CRUD + 函数执行 | 4 |
| D11 自动测试（不只快乐路径） | 6 |
| D12 本地版本管理 | 9 |
| D13 上游同步策略 | 12 |
| D14 界面沿用 dsh Web UI | 8 / 11.1 |
| D15 沙盒行为复刻 | 4 |
| D16 跨应用依赖动态识别 | 5.3 |
| D17 壳导航（零修改妥协版） | 8.2 |
| D18 dsh Web UI 最小改造 | 8 |
| D19 localhost HTTP 三合一 | 1.1 / 11.1 |
| D20 壳原生桥面 | 11.3 |
| D21 进程生命周期 | 11.2 |
| D22 打包与分发 | 11.4 |

## 2. 平台契约速查（已验证事实）

以下均为【已验证】：核验于 2026-08-16 uicp-server / eureka 源码。

### 2.1 产物记录与 API

| 产物 | 领域对象 | 关键字段 | 创建 API |
| --- | --- | --- | --- |
| App | `apppackage/app/domain/App` | name, identifier, description, version, available, hidden, type, url, portable, runtime, trade, category, distribution, requireRoles, requirePermissions | `POST /app-package` |
| Entity | `apppackage/entity/domain/Schema` | name, category, identifier, description, version, tree, extra, app | `POST /app-package/entity` |
| Function | `apppackage/func/domain/Func` | app, schema, identifier, name, comment, body, type（static/object/constructor） | `POST /app-package/entity/func` |
| Menu | `apppackage/menu` | 菜单树 | `POST /app-package/menu` |
| Page | `apppackage/page/domain/Page` | app, menu, schema（Eureka JSON 字符串） | `POST /app-package/menu/:id/page` |

数据层 API：`/app-package/entity/:identifier/list`、`/page`、`/tree`、`/tree/:id/branch`、`POST/PATCH/DELETE /app-package/entity/:identifier[/:id]`、`/stats/count`、`/stats/:field/sum`；分页返回 `{ data: { items, total, page } }`（`DataRepository.findByPage`）。

### 2.2 Function 执行模型

- `Func.exec`：`new vm.Script('(async () => { body })()')`，`runInContext(vm.createContext(context))`；返回值 `?? { status: 0, data: {}, msg: null }`（返回 undefined 时默认成功）。
- `type: static` 无实体实例；`type: object` 先按 `entityId` 加载实体，经 `context.entity` 传入；`type: constructor` 是数据落库前生命周期钩子（仅单条 `insert` 执行，`insertBatch` 不触发）。
- 错误语义：函数 throw → 显式调用路径由调用方 catch 并响应 `{ data: err.message, msg: "操作失败", status: 500 }`（平台同时记错误日志；`execFuncSync` 只记日志不响应）；构造函数 throw 或返回非 0 → 保存中止、不落库。
- 平台沙箱词汇（`Func.buildContext`）：getColl、ObjectId、axios、dayjs、crypto、Buffer、Decimal、ai、requireAdapter、reportError、reportService、executeFunc、__env 等。

### 2.3 查询契约（DataQueryApp）

- 参数规范化：方括号键转点号、嵌套对象递归平铺（兼容 querystring 与 qs 两种解析结果）；`page` / `perPage` 跳过。
- 简单匹配：`?field=value`（不含 `>`）走 `like` 模糊匹配（正则转义 + i）。
- 高阶匹配：`?field=operator>value` 调 `field[operator]`；未知操作符回退 `like`。
- 操作符（Field 定义）：like、notLike、isNull、isNotNull、isBlank、isNotBlank、in、notIn、eq、ne、gt、ge、gte、lt、le、lte、between、notBetween；类型转换：ObjectId 校验、数字 `Number()`、日期/日期时间 `dayjs`（YYYY-MM-DD / YYYY-MM-DD HH:mm:ss）、布尔 `Boolean()`；多值逗号分隔。
- 排序：`_sort=field>asc,...`（默认 `_id: -1`）；`_preventListAll=true` 拒绝空过滤全量列表。
- 空值跳过：参数为空（缺失/空串）不产生查询条件；高阶操作符值段为空同样跳过（本方案约定，行为矩阵确认）。
- 查询范围含 stats（count/sum）与树形（tree / tree-branch）接口（同属查询语义）。

### 2.4 多租户与跨应用

- 每租户独立 Mongo 库（`global.mongo.getDb(tenant.identifier, ...)`）；`req.session.tenant` 为当前上下文。
- `Tenant` 请求头（租户 ObjectId）切换租户，仅当会话用户角色含 `super`（`CrossTenantContextHandler`）；无 super 则头被忽略。
- 实体 identifier 租户级全局唯一（集合名 `sd_<identifier>` 派生），数据/函数可跨应用引用（隔离边界是租户，不是应用包）。
- 跨租户 `getColl(coll, tenant)` 为平台高级能力；dsh 默认不生成跨租户引用。

### 2.5 认证

- 主路径：用户手动输入 JWT（即 `Authorization` 头值）。
- 可选增强：Passkey 登录（平台 `@simplewebauthn/server`，RP_ID=underwork.cn，origin 限 underwork.cn 域）；native 桥实现属平台对接外部项，以 JWT 兜底。
- 请求头模型：`Authorization: <jwt>` + `Tenant: <租户 ObjectId>`。
- Token 存于壳安全存储（11.3），**不进 Web UI 存储**（localStorage/sessionStorage）；平台 API 由 Web UI 直接调用（浏览器跨域已由平台支持，web-admin 同模型）。

### 2.6 eureka 页面与响应契约

- 页面 JSON 顶层 `type: "page"`；组件 `api` 为 `[method:]url`。
- eureka `responseAdaptor`（`eureka-core/src/utils/api.ts`）：`status == 0` 为成功（宽松相等、缺 status 视为 ok），兼容 errorCode/errno/error 格式；payload 为 `{ ok, status, msg, data, ... }`；`data` 在无 status 字段时回退为原始响应；status 422 附带 errors。

## 3. 应用包目录契约（M1 冻结）

### 3.1 目录结构

```text
app-packages/<tenant-identifier>/<app-identifier>/
  tenant.json                  # 租户记录快照（仅标识，不复制配置）
  app.json                     # App 记录
  entities/<entity-identifier>.json   # Schema（含 tree 字段结构）
  funcs/<entity-identifier>/<func-identifier>.js  # Func body（纯 JS，沙盒内部词汇）
  pages/<page-identifier>.json # Eureka 页面 JSON
  menus.json                   # 菜单树与页面挂载
  data/                        # 按会话组织的沙盒数据与测试数据（<session-id>/ 分区）
  tests/                       # 自动测试用例（3.12 沉淀）
  versions/                    # 本地版本快照（不含沙盒运行时数据）
```

### 3.2 文件格式规格

- `app.json` / `tenant.json`：字段对齐 2.1 / 2.4，仅记录标识与必要元信息。
- `entities/*.json`：Schema 记录（含 `tree` 字段结构）；identifier 租户级唯一。
- `funcs/<entity>/<func>.js`：纯 JS body，只允许沙盒内部词汇（4.4）；使用外部依赖词汇 → 标记"依赖人工处理"。
- `pages/*.json`：Eureka schema，顶层 `type: "page"`。
- `menus.json`：菜单树与页面挂载（menu → page 关联）。
- `data/<session-id>/`：该会话的沙盒数据（fixture 初始化，删除会话即清理）。
- `tests/`：自动测试用例（规则模板 + 参数化生成）。
- `versions/<version>/`：产物文件快照（完整拷贝，保留上限参数化）。

### 3.3 命名与一致性

- 一个应用包目录只属于一个租户；路径中的 tenant-identifier 与包内记录一致。
- 目录是唯一事实源：dsh 只在目录上生成与迭代；用户审阅/采纳；平台仅在采纳后由 API 保存（7）。
- 跨应用依赖：不设静态清单，由校验工具从产物动态分析（5.3）。

## 4. 本地验证沙盒（核心实现规格）

### 4.1 承载与路由

【已验证】`packages/host/webserver` 提供 `ctx.webServer.register(route)`（exact/prefix）与 `registerUpgrade`；`packages/client/connection/src/rpc-host.ts` 演示前缀路由 + Fetch 桥 + `request.json()` 解析。

【实现要点】新增 host 插件（如 `packages/uicp/sandbox-server`）：

- 在 `ctx.webServer` 注册 `prefix: /app-package/entity` 路由（同源免 CORS）。
- 请求处理：读取 raw `req/res` → 收集 body（限长）→ `JSON.parse` → 分发到沙盒内部 REST 语义（list/page/tree/tree-branch/CRUD/stats/func）。
- 响应一律 JSON：`{ status, msg, data }`（status 0 成功），与 eureka 2.6 契约精确匹配。
- 路由注册通过 `ctx.effect(() => ctx.webServer.register(...), 'uicp-sandbox: ...')`（registrations 是 effect，返回 disposer）。
- 页面 `api` 开发期同源指向本地沙盒，采纳保存后指向真实平台（运行时改写 base URL）；路径约定一致，页面 JSON 无需为环境改写。沙盒只用于开发期，永不是生产路径。

### 4.2 数据层（ctx.storage KV）

【已验证】`packages/storage/storage/src/backend.ts`：KV facet 为 `open(descriptor)` → `KvUnit`，提供 `loadAll()`（全量快照 `{ tables, global }`）与逐记录持久化写入；单元名需匹配 `^[a-z][a-z0-9_]*$`。

【实现要点】

- 单元（unit）按会话划分：`uicp_sandbox_<session>`（会话 id 需归一化为小写/下划线以匹配单元名规范）。
- 表（table）按实体 identifier 归一化（小写/下划线）。
- 记录键 = 记录 `_id`；值 = JSON 记录。
- `loadAll()` 提供全量快照供查询引擎内存过滤；写入按会话串行（调用方负责写序，KV 不序列化并发写）。
- fixture 在会话创建时写入对应会话单元（seed）；`data/<session-id>/` 为 JSON 后端落盘目录（可 diff，配合版本管理）。

### 4.3 查询引擎

【实现要点】按 2.3 语义在 KV 快照上实现：

- 参数规范化（方括号 → 点号、嵌套平铺）→ 字段匹配（含点号字段）→ 操作符分发。
- 操作符实现与 Field 行为一致（正则转义 + i 的 like/notLike、isNull/isBlank 族、in/notIn 逗号分隔、eq/ne/gt/ge/gte/lt/le/lte 类型转换、between/notBetween 区间）。
- 空值/空操作符值段跳过；`_sort`（默认 `_id: -1`）、`_preventListAll`、分页（page/perPage）、stats（count/sum 聚合）、树形（tree 组装、tree-branch 按 path 前缀）。
- 全量加载 + 内存过滤/排序（本地数据量小；超阈值行为见 4.8）。
- 质量关卡：语法检查 → LLM 审查 Mongo 查询语法/语义 → 人工兜底。

### 4.4 函数执行器

【已验证】`packages/workflow/workflow-worker-thread/src/runtime.ts`：`new vm.Script('(async () => {\n${body}\n})()')` + `vm.createContext` + 冻结注入函数 + worker 隔离 + 预解析/预算/取消。

【实现要点】

- 镜像上述模式：预解析（编译期抛 `SCRIPT_PARSE`）→ worker 内 `vm.createContext` → 注入内部词汇并冻结函数。
- 内部词汇：`getColl`（指向本地 KV 数据层）、`ObjectId`、`dayjs`、`Decimal`、`crypto`、`Buffer`、`executeFunc`（递归调沙盒函数）、`reportError` / `reportService`（落本地日志）、`__env`。
- 外部依赖词汇（axios、ai、requireAdapter 等）**不注入、不支持、不 mock**；使用它们的函数标记"依赖人工处理"。
- 错误语义（2.2）：正常返回对象 → 原样转发；undefined → `{status:0,data:{},msg:null}`；throw → `{data: err.message, msg:"操作失败", status:500}`（显式调用路径；sync 路径只记日志）。
- 构造函数生命周期：单条 insert 在组装实体后、落库前执行 `type === 'constructor'` 函数；非 0 中止且不落库；批量 insertBatch 不触发。

### 4.5 文件上传

【实现要点】沙盒对上传类交互以 mock 支持（不执行真实上传）：上传端点返回 mock 成功响应（如 `{ status: 0, data: { url: 'mock://...' } }`），eureka 上传组件在预览中可用但结果落 mock。

### 4.6 沙盒数据生命周期

- 沙盒数据按会话独立分区（`data/<session-id>/`），新会话以 fixture 初始化。
- 删除会话即清理其沙盒数据：上游无现成会话删除 API【已验证：session-persistence 为追加式，无删除入口】→ 由我们的 host 插件提供 `removeSession(sessionId)` RPC（删除会话持久化产物 + 清理 `data/<session-id>`），侧栏删除动作调用。

### 4.7 行为矩阵契约测试

【实现要点】

- 同语料跑沙盒 vs 真实平台（远程 API 测试租户或平台方基准实例）：覆盖 CRUD、查询符（含边界/空值）、stats、树形、构造函数、函数执行错误语义。
- 覆盖清单从 uicp-server 源码逐函数对照生成，保持可审计；是发布前必过的保真闸门。
- 基准环境不可得 → 保真闸门不可用（外部依赖，见 13）。

### 4.8 规模阈值

【实现要点】沙盒查询采用全量加载 + 内存过滤；设定会话数据阈值（建议初始：单会话 ≤ 10 万条记录或 ≤ 200MB，参数化），超限时拒绝查询并提示"沙盒数据超限，请清理或拆分会话"。

## 5. 校验工具（apppackage_validate）

【实现要点】新增 tool 包，`ctx.tools.register(ToolDefinition)`（含 canonical output 声明），挂在 agent preset 中。

### 5.1 静态校验矩阵

- 页面 JSON：Eureka `schema.json` JSON Schema 校验（additionalProperties: false）。
- Func body：`vm.Script` 可编译；标识符白名单 = 沙盒内部词汇 + 业务注入变量；使用外部依赖词汇 → 标记"依赖人工处理"（不视为失败）。
- Entity：tree 结构合法、identifier 唯一。
- 测试数据：字段类型与 Entity tree 一致、引用合法、与 fixture 一致。
- 应用包：App/Entity/Func/Page/Menu 引用完整（menu 挂载、schema 归属、app 归属）。
- 租户一致性：包内记录同一租户；导入前校验目标应用包属于当前租户。

### 5.2 错误回喂

校验结果结构化（文件、行/字段、规则、期望、实际、严重级别），回喂模型进入修正循环。

### 5.3 动态跨应用依赖分析

- 扫描页面 JSON（`api` 中的 `/app-package/entity/:identifier/...`）与 Func body（`getColl` / `executeFunc` 调用）提取 identifier。
- 经当前租户"实体 → 应用"归属映射（来自"平台 → 目录"同步拉取或沙盒/基准查询）差分（排除本应用包）得跨应用依赖。
- 分析结果仅作派生缓存，始终以重新分析为准；分析覆盖不到的模式（动态拼接 identifier）显式标记，发布前用户确认。
- 校验目标存在（同租户）、无悬空引用；发布顺序提示（依赖应用先发布或目标已存在）。
- 跨应用引用由用户主动发起（dsh 在产物中生成引用，分析器随后识别）；dsh 默认不生成跨租户引用（跨租户为显式高级能力，需标记本地未验证并经用户确认）。

## 6. 自动测试（tool-apppackage-test）

【实现要点】

- 用例生成：规则模板 + 基于 Entity tree / Func 签名的参数化生成；fixture 保证可复现；用例沉淀 `tests/`。
- 覆盖矩阵：
  - 正例：标准 CRUD、函数正常返回、页面数据链路可用；
  - 反例：非法/缺失/越界输入、类型错误、非法 identifier、引用不存在、跨租户访问被拒（权限模型开发调试阶段不处理）；
  - 边界：空数据、分页边界、字符串/数值边界、删除被引用记录、重复插入；
  - 查询操作符：各操作符正反例、`>` 转义、未知操作符回退、空值跳过、`_preventListAll`、`_sort`、stats（count/sum）、树形（tree/branch）；
  - 构造函数：单条 insert 落库前执行、非 0 中止不落库、insertBatch 不触发；
  - 外部依赖函数：不进入自动测试，标记"依赖人工处理"；
  - 契约：`{status,msg,data}` 与错误码约定。
- 执行：调沙盒 HTTP → 断言 → 结构化报告回喂模型（失败 → 修复 → 重跑）。

## 7. API 保存工具（tool-apppackage-publish）

【实现要点】

- 前置门槛（四关齐备才允许保存）：静态校验（5）通过 + 自动测试全绿（6）+ 沙盒与平台契约一致性（4.7）+ 用户采纳（显式闸门）。
- 保存流程：平台 → 目录同步后的差异 → 逐记录 upsert（App → Entity → Func → Menu/Page；创建 POST、更新 PATCH）；幂等；以当前租户会话调用（`Authorization` + `Tenant` 头），拒绝租户不匹配目录。
- 测试数据不写入平台（仅本地沙盒）；平台侧验证由人工使用真实业务数据。
- 跨应用：保存前校验目标应用已存在或提示先发布目标。
- API 保存是最后一步；平台侧发布回滚暂不考虑（由平台/人工处理）。
- 发布后由人工在平台侧走快乐路径兜底（保存 / 查询 / 函数执行各走一遍主流程），不属于 dsh 自动化流程。

## 8. UI 集成（基于 dsh Web UI，零上游修改）

### 8.1 已验证的插槽机制

【已验证】

- `packages/client/ui-layout/src/client/index.ts` 声明四个子槽：`sidebar`、`conversation`、`details`（single，替换语义）、`shell.overlay`（list，叠加）。
- `packages/client/ui-sidebar/src/client/contract/slots.ts`：`sidebar.workspaces`（single，浏览区）、`sidebar.settings`、`sidebar.footer.action`（list）。
- `packages/client/ui-conversation/src/client/contract/slots.ts`：`conversation.session.header`（single）、`conversation.session.header.actions`（list，标题旁动作）、`conversation.view`（list）等。

### 8.2 导航实现规格（D17 零修改妥协版）

- **侧栏浏览区**：注册新 client 插件替换 `sidebar.workspaces` 槽（装配层不加载上游 ui-workspace 的对应 occupant）；实现"租户 → 应用包 → 会话"树（当前/最近/全部、懒加载、虚拟滚动，无全局搜索）。
- **会话切换**：侧栏会话列表为主；`conversation.session.header.actions` 注册 additive 动作按钮 → 弹出会话选择器（弹层可为普通 UI，不必占 overlay 槽）。
- **产物工作区**：注册新 client 插件替换 `details` 槽（tabs：渲染预览 / 可视化编辑 / 原始 JSON / 测试 / 版本）。
- **联动**：会话选中（`list.current`，持久化）更新上下文；对话引用产物可跳转（自有 store 联动）；布局状态按会话记忆。
- 零上游修改确认：全部通过既有槽位替换/叠加实现，替换在装配层完成，不改上游文件。
- eureka/eureka-editor 依赖 monaco，按独立 chunk 懒加载，编辑器仅在使用时装载。
- 切换租户（工作空间）需显式确认，不允许任务中途静默切换。

### 8.3 会话与应用包绑定

【已验证】

- 会话创建：客户端 `sessions.create({ cwd })`（`packages/client/runtime/src/client/sessions/service.ts`）直接支持 cwd；host 侧 `options.meta.cwd` 校验绝对路径（`packages/core/session/src/index.ts`）。
- `SessionSummary.cwd` 支持按应用包（workspace）分组/过滤；切换会话 = 会话列表 `current` 选中态。

【实现要点】创建/继续会话时 cwd = 应用包目录；侧栏按 cwd 分组；继续对话前先"平台 → 目录"同步（同步前打版本快照）。

### 8.4 知识注入

- agent preset（新目录 `apps/cli/config/agent-presets/uicp/`）：交付物 = AppPackage；行为规则。
- skill：契约词汇按需查询（Eureka schema.json、Func 内部词汇、查询契约、记录结构、租户模型）；不整包塞入上下文。
- 校验工具（5）兜底。

### 8.5 适配层（our-ui/adapter）

【实现要点】所有对上游 client 组件/服务的 import 集中在 `our-ui/adapter` 之后；上游接口变更时仅修适配层；作为上游同步的收口（12）。

## 9. 版本管理（tool-apppackage-version）

【实现要点】

- 快照对象：`funcs/**/*.js`、`entities/`、`pages/`、`menus.json`、`app.json`、测试数据 fixture（不含沙盒运行时数据；沙盒数据随会话组织与清理）。
- 自动快照节点：生成完成、eureka-editor 写回、采纳前、平台 → 目录同步前；支持手动打点命名。
- 切换/回滚：恢复为当前工作区 → 重新过 5 校验 → 可重跑 6 测试。
- 语义边界：切换只影响本地工作区；平台 `PageVersion` 是已入库历史，与本地草稿快照互不同步。
- 保留上限参数化（默认建议 50 个版本），防止目录膨胀。

## 10. 会话与沙盒数据生命周期

- 会话 = 数据边界：创建会话（cwd = 应用包目录）→ fixture 初始化会话沙盒数据区 → 会话内测试/迭代 → 删除会话联动清理沙盒数据。
- 删除能力由我们的 host 插件提供（4.6），侧栏删除动作触发。

## 11. 桌面壳（Tauri）

### 11.1 工程结构与加载

【实现要点】

- 壳工程（独立目录）spawn dsh 本地进程（sidecar，`dsh web` 链路）；端口可配 0（OS 分配，`webStartup.port ?? 3080`）；等端口就绪（健康探测）后 webview 指向 `http://127.0.0.1:<port>`。
- 加载方式：localhost HTTP 三合一（dsh Web UI + RPC/事件流 + 沙盒 API）。
- 界面沿用 dsh Web UI 原生风格（放弃 Codex 风格）；不引入独立视觉体系。

### 11.2 进程生命周期

- 启动序列：spawn → 就绪探测 → 加载 UI；崩溃自动重启（指数退避）；退出联动（SIGTERM → 超时强制）；孤儿保护；单实例（Tauri single-instance）；日志落壳日志文件。

### 11.3 原生桥面（Tauri commands）

- 凭证存储：Token 安全存取（macOS Keychain / Windows DPAPI / 未来 Linux Secret Service）；仅 set/get/delete；启动时自动读取并校验（D5），失效才要求重新输入/登录。
- Passkey（可选增强）：native WebAuthn（macOS AuthenticationServices / Windows WebAuthn），credential 交 Web UI 提交平台；平台约束见 2.5。
- 托盘与通知、外链打开（tauri-plugin-opener）。
- 目录选择不做（工作区由 dsh 自动管理）。

### 11.4 打包与分发

- macOS：Developer ID 签名 + 公证 → dmg；Windows：Authenticode → NSIS/MSI；Tauri updater。
- dsh 作为 sidecar 资源随壳打包（Node 22 运行时，arm64/x64 双架构），壳版本与内置 dsh 版本绑定发布；每次上游同步后重建。

## 12. 上游同步操作手册

- 同步范围：核心 + Web UI（跟随上游）；我们的功能全部为新增插件/配置，不改上游文件。
- 共享文件清单（确需修改的最小集）：pnpm-workspace.yaml、tsconfig.host.json / tsconfig.client.json、根 package.json、docs 导航；改动保持最小并记录。
- 冲突预案：先取上游 → 重放本地补丁（脚本化、可重放）；import 经适配层（8.5）收口。
- 依赖隔离：eureka 私有 registry 依赖只出现在新增包中，不写入上游包 package.json。
- 同步流程：`git fetch upstream` → 合并到维护分支 → 修适配层/重放补丁 → 跑 `pnpm install && pnpm run typecheck && pnpm run test` + 本项目 smoke；合并与提交前征求用户同意。
- 门禁义务：新增包必须通过上游既有门禁（workspace constraints、knip、doc-sync、coverage）。

## 13. 已知边界与外部依赖

- 真实平台基准环境：契约测试（4.7）前提，需平台侧提供；不可得则保真闸门不可用。
- 外部依赖函数（axios/ai/requireAdapter）：沙盒不支持，由用户在协作阶段实际使用/真实环境验证后确认。
- 平台侧行为问题：由平台维护方负责修复（平台已通过线上验证），不作为 dsh 风险项。
- 平台侧发布回滚：暂不考虑。
- 单机单用户模型：不涉及多人/多机协作。
- 工程验收项：Tauri sidecar 打包（M0）、eureka 构建嵌入（M2，含独立 webview 降级预案）。
- 长期观察项：上游 client 接口演进（适配层与补丁重放兜底）。
- 用户协作即持续验证：用户实际使用产物并反馈，覆盖行为矩阵之外的行为。
- 发布后平台侧人工快乐路径兜底（非自动化，覆盖范围有限）。

## 14. 里程碑验收清单

### M0：壳 + UI 集成原型

- [ ] Tauri 壳拉起 dsh 进程、端口就绪、webview 加载 localhost。
- [ ] JWT 输入 → 校验 → 列租户（`GET /systemctl/tenant/list`，available=true）→ 进入租户 → 列/新建应用包 → 开始对话。
- [ ] 侧栏浏览区（租户 → 应用包 → 会话）替换 `sidebar.workspaces` 生效；会话头切换按钮生效。
- [ ] 进程守护基础：拉起 / 就绪 / 退出联动 / 单实例。
- [ ] 单机模型确认：无目录选择入口。

### M1：契约冻结

- [ ] 应用包目录结构与文件格式按第 3 章落地；示例应用包（1 租户 + 1 App + 1 Entity + 2 Function + 1 列表页 + fixture）。
- [ ] 人工导入平台验证字段映射与 API 可行。

### M2：知识注入 + 预览

- [ ] preset + skill 上线，agent 能按契约生成示例包。
- [ ] `apppackage_validate` 静态校验矩阵生效。
- [ ] eureka 渲染器内嵌预览（fixture 数据）可渲染页面；上传组件 mock 可用；若内嵌受阻，走独立 webview 降级预案。

### M3：完整闭环

- [ ] 沙盒：CRUD/查询（含 stats/树形）/函数执行/构造函数/上传 mock 全部可交互；行为矩阵契约测试跑通。
- [ ] eureka-editor 干预写回本地并重新校验。
- [ ] 自动测试（正反例/边界）覆盖矩阵生效、失败回喂修复。
- [ ] 版本快照/切换/回滚可用。
- [ ] API 保存（逐记录 upsert、幂等、测试数据不写平台）跑通"需求 → 生成 → 校验 → 预览/干预 → 自动测试 → 采纳 → 保存"。

### M4：硬化

- [ ] 快照测试与文档；契约保真与测试用例沉淀。
- [ ] 无头渲染校验（可选，CI 补充）。
- [ ] 壳打包（签名/公证/安装包/更新）与 sidecar 双架构构建。
- [ ] schema 与 eureka 版本同步脚本；上游同步手册可执行。

## 附录 A：已验证代码位置索引

- dsh webserver 路由：`packages/host/webserver/src/index.ts`
- RPC 桥模式：`packages/client/connection/src/rpc-host.ts`
- storage KV 契约：`packages/storage/storage/src/backend.ts`
- vm 执行模式：`packages/workflow/workflow-worker-thread/src/runtime.ts`
- 会话创建 cwd：`packages/client/runtime/src/client/sessions/service.ts`、`packages/core/session/src/index.ts`
- 插槽声明：`packages/client/ui-layout/src/client/index.ts`、`packages/client/ui-sidebar/src/client/contract/slots.ts`、`packages/client/ui-conversation/src/client/contract/slots.ts`
- preset/skill/credentials/tools：`packages/preset/agent-presets`、`packages/skill`、`packages/credentials`、`packages/core/tools`
- 端口配置：`packages/bundle/web-app/cordis.patch.yml`（`webStartup.port ?? 3080`）
- uicp 查询组装：`uicp-server/src/apppackage/data/application/DataQueryApp.js`
- uicp 字段操作符：`uicp-server/src/apppackage/field/domain/Field.js`
- uicp 数据写入/构造函数：`uicp-server/src/apppackage/data/application/DataCmdApp.js`
- uicp 函数执行：`uicp-server/src/apppackage/func/domain/Func.js`、`func/interaction/FuncExecutor.js`
- uicp 分页返回：`uicp-server/src/apppackage/data/infrastructure/DataRepository.js`
- uicp 租户切换：`uicp-server/framework/web/handler/CrossTenantContextHandler.js`
- uicp Passkey：`uicp-server/src/user/authentication/infrastructure/adapter/PasskeyAuthenticatingAdapter.js`
- eureka 响应解析：`eureka/packages/eureka-core/src/utils/api.ts`（`responseAdaptor`）
- eureka 页面契约：`eureka/docs/zh-CN/types/api.md`、`eureka/packages/eureka/schema.json`
