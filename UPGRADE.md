# dsh 低代码平台驱动器改造方案

> 状态：全部决策已定（2026-08-16，D1–D22），D17 零修改妥协版已确认（2026-08-16）；方案内全部断言已完成代码调研验证（2026-08-16），运行行为与外部条件（真实平台基准、Passkey native 桥）明确标注为外部依赖或可选增强，不留待实施阶段调研项；方案进入预定稿；已通过 dsh 代码可行性验证（2026-08-14，见第 8 节）。本文档是未配对的规划文档，不进入 docs/ 站点；方案稳定后再决定是否沉淀为正式文档。
> 平台代码以同机仓库为参照：`/Users/wayne/Documents/Projects/uicp-server`（运行时）、`/Users/wayne/Documents/Projects/eureka`（渲染框架）。

## 1. 背景与目标

现状：

- dsh（DeepSeek Harness）是通用 agent harness：用户给需求，agent 调用工具完成开发任务。
- 低代码平台由 uicp-server（服务端运行时）、eureka（JSON 驱动的页面渲染）、uicp-web-admin（管理端）组成。
- 平台用四类产物描述一个应用：App（应用包）、Entity（Schema，对应 Mongo Collection）、Function（服务端执行的代码块）、页面 JSON（Eureka schema）；Menu 作为页面挂载结构纳入应用包一并管理。Entity 与 Function 的关系类似 Java 的 Class 与函数（对象函数、静态函数、构造函数）。
- 平台是多租户系统，结构为：租户 → 应用包 → Entity / 页面 JSON。所有产物都归属某个租户。
- 同租户内实体 identifier 全局唯一，应用包之间可跨应用引用数据与函数（隔离边界是租户，不是应用包）。

目标：把 dsh 改造成平台的"生成驱动器"，并以**桌面应用**形态交付。dsh 通过**手动输入 JWT 为主（Passkey 为可选增强）**完成认证，最终得到平台 Token（JWT）作为所有平台 API 请求的必须参数；**每个可用租户即一个项目**，无独立项目概念；租户下按**应用包（App）**组织，用户选择应用包后新建或继续对话；此后 dsh 在该租户、该应用包内设计并生成完整产物——Entity 定义、与 Entity 关联的 Function、页面 JSON（含菜单挂载），交付平台运行；开发完成后由 dsh 自动测试（**覆盖正反例与边界，不只快乐路径**），在**数据交互与 uicp-server 一致的本地沙盒**（数据保存、查询、函数执行）中完成全部验证与测试，用户采纳后经 API 保存完成发布（**API 保存是最后一步**，发布后由人工在平台侧走快乐路径兜底）；支持**从零搭建应用包**：Entity 建模（字段/关联）与测试数据生成，用于页面/函数开发与预览；页面 JSON 可在桌面端内嵌的 eureka 渲染器中预览，并可用 eureka-editor 局部干预；后续修改需求时，dsh 增量修改对应产物，且全程不触碰其他租户的数据。

### 1.1 设计原则（用户指定，全局约束）

- **壳服务于 dsh**：桌面壳是 dsh 的载体，不是独立产品。界面沿用 dsh Web UI 原生风格（基于 dsh Web UI + 最小改造，D14/D18 修订），不引入独立视觉体系；dsh 功能（应用包工作区、生成、校验、沙盒、预览/编辑器、自动测试、版本管理）始终是第一优先级；任何改造不得牺牲功能可达性与既有扩展点。
- **与 dsh 深度融合**：方案所有功能改造必须以 dsh 既有机制为载体——preset / skill / tool / client 插件 / webserver 路由 / session / credentials / jobs，复用而非重造；可行性已在第 8 节对照验证。
- **可持续上游同步**：持续接收上游核心功能更新；改动分离（扩展点优先、新增优先于修改）、共享文件清单化与补丁重放（第 5 节）是全局执行约束，不因功能或风格调整而放松。
- **全量验证原则**：方案内所有断言必须在本阶段完成调研验证（代码级）；无法本地验证的运行行为与外部条件明确标注为外部依赖项或可选增强，不进入实施阶段才调研。

## 2. 平台契约（现状事实）

以下事实核验于 2026-08-14 uicp-server 源码。

### 2.1 产物记录与 API

| 产物 | 领域对象 | 关键字段 | 创建 API |
| --- | --- | --- | --- |
| App | `apppackage/app/domain/App` | name, logo, identifier, description, version, available, hidden, type, url, portable, runtime, category, distribution, requireRoles, requirePermissions | `POST /app-package` |
| Entity | `apppackage/entity/domain/Schema` | name, category, identifier, description, version, tree（数据树开关，布尔）, extra, app | `POST /app-package/entity` |
| 字段 | `apppackage/field/domain/Field` | schema, name, label, type, unique, editable, comment, extra（字段是独立记录，不内嵌于 Schema） | `POST /app-package/entity/field` |
| Function | `apppackage/func/domain/Func` | app, schema, identifier, name, comment, body, type（static/object） | `POST /app-package/entity/func` |
| Menu | `apppackage/menu` | 菜单树 | `POST /app-package/menu` |
| Page | `apppackage/page/domain/Page` | app, menu, schema（Eureka JSON 字符串） | `POST /app-package/menu/:id/page` |

数据层 API（页面 JSON 中的 `api` 指向这些接口）：`/app-package/entity/:identifier/list`、`/page`、`/tree`、`POST/PATCH/DELETE /app-package/entity/:identifier[/:id]`、`/stats/*` 等，均由 `apppackage/data` 提供；分页接口返回 `{ data: { items, total, page } }`（DataRepository.findByPage）。

### 2.2 Function 执行模型

- `Func.body` 是 JS 代码字符串，运行时以 `(async () => { body })()` 形式在 `vm.Script` 中执行（`Func.exec`）。
- `type: static` 无实体实例；`type: object` 先按 `entityId` 加载实体实例，经 `context.entity` 传入。`type: constructor` 是**数据落库前的生命周期钩子**：`DataCmdApp.insert` 在实体对象组装完成后、`dataRepository.insert` 落库前遍历实体函数，执行 `type === 'constructor'` 的函数（入参为已组装的 `entity`），返回非 0 status 即中止保存；**构造函数仅在单条 `insert` 路径执行，`insertBatch` 批量插入不触发**。
- 沙箱上下文词汇（平台侧事实）：getColl、ObjectId、axios、dayjs、crypto、Buffer、Decimal、ai、requireAdapter、reportError、reportService、__funcExecutor（可递归调用其他函数）、__env 等（`Func.buildContext`；设计文档早期写作 executeFunc，实为 buildContext 内部变量名）。**沙盒镜像范围排除外部依赖词汇（axios、ai、requireAdapter 等），见 3.11。**
- 函数执行入口：`POST /app-package/entity/:schemaIdentifier/:id/func/:funcIdentifier`（对象函数）、`POST /app-package/entity/:entityIdentifier/func/:funcIdentifier`（Schema 级执行）。

### 2.3 页面 JSON 契约

- 页面 JSON 是 Eureka schema，顶层必须是 `type: "page"`；组件树由 eureka 渲染。
- Eureka 组件 `api` 字段使用 `[method:]url` 形式，接口返回必须为 `{ status, msg, data }`（status 0 表示成功）。
- 页面查询 `GET /app-package/menu/:id/page` 返回解析后的页面 JSON（非 Page 记录包装）；线上历史页面 JSON 可能携带 `/lowcode/form/schema/...` 数据 URL（平台前端网关改写，直连 API 实测 404），直连路径以 `/app-package/entity/...` 为准（实测 200）。
- 平台已有从 Entity 生成页面的能力：`POST /app-package/entity/:id/converter-page`（`SchemaCmdApp.generatePage`），模板位于 `apppackage/entity/application/pt/`（PageTemplate、CreateModal、EditModal、DeleteButton）。

### 2.4 多租户模型

- 租户记录（`systemctl/tenant/domain/Tenant`）：`_id, name, identifier, available, comment, trade, quota, opsConfig, personalizeConfig, thirdPartAppConfig, notificationConfig` 等。
- 隔离方式是**每租户独立 Mongo 数据库**：所有 Repository 以 `tenant` 构造，数据落在 `global.mongo.getDb(tenant.identifier, tenant.opsConfig?.database)`，API 层从 `req.session.tenant` 取得当前租户。
- 租户 API：`POST /systemctl/tenant`、`GET /systemctl/tenant/list|page|:id`、`PATCH /systemctl/tenant/:id`、配额与各配置子接口、`DELETE /systemctl/tenant/:id`。
- 同一应用包（App）下可含多个 Entity / Function / Menu / Page，全部通过 `app` 字段归属到应用包；应用包本身归属租户数据库。
- 管理端的租户绑定模型（uicp-web-admin `components/layout/site-header.jsx`）：登录后调 `GET /systemctl/tenant/list`，只展示 `available === true` 的租户；选中后租户 ID 存入 `sessionStorage`，标题与后续页面均按该租户作用域工作。

### 2.5 登录与会话模型

- **认证方式（已定，D6）**：以**手动输入 JWT 为主路径**；Passkey 为**可选增强**（平台接口与约束已核实：`@simplewebauthn/server`、RP_ID=underwork.cn、origin 限定 underwork.cn 域；壳层 native command 调系统认证器完成断言的实现可行性属平台对接外部项，以 JWT 兜底）。无论哪种方式，最终 Token（JWT）是所有平台 API 请求的必须参数（`Authorization` 头）。
- 会话还原（平台侧事实）：请求带 `Authorization: <jwt>`，`framework/web/handler/SecurityContextHandler` 校验 JWT 并从会话表还原 `req.session.user / req.session.tenant`；`CrossTenantContextHandler` 支持用 `Tenant` 请求头（租户 ObjectId）切换当前租户上下文，**但仅当会话用户角色含 `super`**——无 super 角色时 Tenant 头被忽略，请求停留在会话绑定租户。
- 客户端请求模型（uicp-web-admin）：每个请求附加 `Authorization`（Token）与 `Tenant`（租户 ID）两个头；已有 Token 时先自动校验会话，失效则清掉并回到输入页。

### 2.6 查询契约（DataQueryApp 组装逻辑）

- 参数规范化：方括号键（`field[sub]`）转点号（`field.sub`），嵌套对象递归平铺，兼容 querystring 与 qs；`page` / `perPage` 跳过。
- 简单匹配：`?field=value`（不含 `>`）走 `like` 模糊匹配（正则转义 + i）。
- 高阶匹配：`?field=operator>value` 调用 `field[operator](values, filter)`；操作符不存在时回退 `like`。
- 操作符清单（Field 定义）：like、notLike、isNull、isNotNull、isBlank、isNotBlank、in、notIn、eq、ne、gt、ge、gte、lt、le、lte、between、notBetween。
- 类型转换：ObjectId 校验有效性、数字 `Number()`、日期/日期时间 `dayjs`（YYYY-MM-DD / YYYY-MM-DD HH:mm:ss）、布尔 `Boolean()`；in/notIn/between/notBetween 用逗号分隔多值。
- 排序：`_sort=field>asc,...`，默认 `_id: -1`；`_preventListAll=true` 拒绝空过滤的全量列表查询。
- 空值跳过：查询参数为空（缺失/空串）时不产生查询条件（`DataQueryApp` 的 `!params[key]` 行为）；高阶操作符的值段为空（如 `field=in>`）同样跳过查询条件（本方案约定，行为矩阵对真实平台确认）。
- 查询范围含 stats（count/sum）与树形（tree / tree-branch）接口，同属查询语义，纳入沙盒与测试。

### 2.7 跨应用互动契约（现状事实）

- 实体 identifier 在租户内全局唯一（集合名由 identifier 派生，`sd_<identifier>`），数据 API 不带应用作用域——同租户下任意应用的页面/函数可直接引用其它应用的实体数据。
- 函数沙箱提供跨应用调用：`__funcExecutor(schema, func, entityId)` 按 identifier 调用（可调其它应用的函数）；`getColl(coll, tenant)` 可显式访问指定租户的集合（跨租户为平台高级能力）。
- 应用（`app` 字段）是归属关系，不是访问隔离边界；隔离边界是租户（每租户独立数据库）。

## 3. 改造设计

### 3.1 产物契约（dsh 的目标输出）

应用包目录（文件形式，可版本控制、可审查），顶层以租户为界，第二层以应用包为界。每个可用租户即一个 dsh 项目（见 3.2），无独立项目维度；目录路径即"租户 / 应用包"两级：

```text
app-packages/<tenant-identifier>/<app-identifier>/
  tenant.json                  # 租户记录快照（仅标识，不复制配置）
  app.json                     # App 记录
  entities/<entity-identifier>.json   # Schema + 内嵌 fields（平台字段为独立记录）
  funcs/<entity-identifier>/<func-identifier>.js  # Func body（纯 JS）
  pages/<page-identifier>.json # Eureka 页面 JSON
  menus.json                   # 菜单树与页面挂载
  data/                        # 按会话组织的沙盒数据与测试数据（3.4 / 3.11）
  tests/                       # 自动测试用例（3.12）
  versions/                    # 本地版本快照（3.13）
```

字段严格对齐 2.1 与 2.4 的记录结构；Func body 只允许使用 2.2 的沙箱词汇。一个应用包目录只属于一个租户，目录路径中的 tenant-identifier 与包内记录一致。
应用包目录是 dsh 与用户协作的**桥头堡与唯一事实源**：dsh 只在此目录上生成与迭代，用户在此审阅与采纳；平台仅在目录被采纳后由 API 保存（3.6）。

### 3.2 登录、租户与应用包选择（安全前置）

- **认证方式（已定，D6）**：手动输入 JWT 为主路径，Passkey 为可选增强（2.5），最终产出平台 Token（JWT）作为所有 API 请求的必须参数；首次启动与 Token 失效时提供输入/登录入口。
- Token 存于 dsh 桌面应用的安全存储（不落代码、不进会话日志、不进产物文件），每次平台请求附加 `Authorization` 与当前项目（租户）的 `Tenant` 头；**持久化（D5 已定）**：启动时自动读取并校验，失效才要求重新输入/登录。
- 平台 API 由桌面端 Web UI 直接调用（平台已支持浏览器跨域，web-admin 同模型），Token 由安全存储注入请求头。
- 会话失效（401/校验失败）时提示重新输入 Token，不静默重试，不降级为匿名访问。
- **dsh 不新建租户、不设项目选择**：每个可用租户即一个项目；登录后调 `GET /systemctl/tenant/list`，过滤 `available === true`，把全部可用租户作为工作空间列表展示；进入某个租户即在该租户工作。
- 跨租户切换机制（已核实）：请求携带 `Tenant` 头（租户 ObjectId），平台 `CrossTenantContextHandler` 在会话用户角色含 `super` 时切换到目标租户，否则忽略该头；dsh 面向平台管理端用户（与 web-admin 同模型），实际为 super 角色；若出现非 super 用户场景，租户列表需按可访问租户过滤（边界项）。
- **租户下按应用包组织**：进入租户后展示该租户下的应用包列表（按租户查询 `GET /app-package/list`）；用户选择一个已有应用包或新建应用包，然后**新建对话或继续该应用包的对话**。
- 当前上下文 = 租户 + 应用包：所有产物操作限定在当前应用包内，目录（3.1）第二层即应用包；系统提示与界面明确展示当前租户与应用包。
- **会话与应用包绑定（已核实）**：会话创建经 `options.meta.cwd`（校验为绝对路径）绑定应用包目录（`app-packages/<tenant>/<app>/`）；客户端服务 `sessions.create({ cwd })` 直接支持 cwd 注入，`SessionSummary.cwd` 支持按应用包分组/过滤；会话切换经会话列表 `current` 选中态（持久化），侧栏与会话头切换走同一路径。
- **沙盒数据随会话组织**：沙盒数据按会话独立分区（`data/` 下按会话），删除会话即清理其沙盒数据（3.11）。
- **继续已有应用包对话时，先拉取平台现状到本地目录**（同步方向：平台 → 目录，覆盖平台侧新增/修改），再基于目录增量生成；目录保持为唯一事实源，未同步前不生成增量。
- 当前租户是会话状态（用户进入哪个租户，就在哪个租户工作），进入每个工具调用与产物操作；系统提示与界面明确展示当前租户，避免模型跨租户操作。
- 生成、读取、校验、导入的所有产物必须属于当前租户；目录结构（3.1）与导入工具都不接受跨租户输入。
- "切换租户"（即切换工作空间）提供与 web-admin 一致的选择入口，但切换必须显式确认，不允许在任务中途静默切换。

### 3.3 知识注入（dsh 侧）

- 新增 agent preset（`apps/cli/config/agent-presets/`，参照 code/standard）：把"交付物 = AppPackage"写进系统提示，页面开发任务默认输出 Eureka JSON。
- **知识注入深度（D4 已定）**：preset 承载行为规则（交付物 = AppPackage），skill 承载契约词汇（按需查询、不整包塞入上下文），静态校验工具（3.5）兜底。
- 新增 skill：装载平台契约词汇：
  1. Eureka 组件词汇：`eureka/packages/eureka/schema.json`（约 1MB，带字段描述，构建产物，以数据依赖方式引用）；
  2. Func 沙箱词汇表与执行模型（2.2）；
  3. App/Schema/Func/Page/Menu 记录结构与字段语义（2.1），以及租户模型（2.4）；
  4. 查询契约与字段类型语义（2.6）：页面 `api` 的查询参数按此构造。
- 优先复用平台现成文档与源码（eureka/docs/zh-CN、uicp-server 领域代码），不重复维护第二份知识。

### 3.4 生成流程

进入租户 → 选择/新建应用包（绑定对话）→ 需求 → 设计（Entity 建模 + Function 划分 + 页面规划 + 菜单）→ 分产物生成 → 校验 → 修正循环 → 交付。

- 对象函数 / 静态函数的划分遵循业务语义；构造函数是数据落库前的生命周期钩子（D2 已定，见 2.2），用于字段加工、默认值与落库前校验；权限（requireRoles/requirePermissions）在开发调试阶段不处理，由平台侧后续配置。
- 页面生成优先复用平台 `converter-page` 能力或 `pt/` 模板，而不是从零生成 CRUD 页面。
- **从零搭建场景**：新建应用包后，先设计 Entity 树（字段类型、实体间引用、identifier 唯一），再生成**测试数据 fixture**（`data/<entity-identifier>.json`），随后按模板生成页面、划分 Function、挂载菜单；测试数据供本地预览与校验使用。
- 测试数据生命周期：fixture 落本地目录（参与 diff/审阅），并作为本地验证沙盒（3.11）的初始数据；**测试数据仅存本地沙盒，不写入平台**；平台侧验证由人工使用真实业务数据。

### 3.5 校验（生成质量门禁）

- 页面 JSON：用 Eureka `schema.json` 做 JSON Schema 校验（additionalProperties: false）。
- Func body：`vm.Script` 可编译；标识符白名单 = 沙箱支持词汇 + 业务注入变量；使用外部依赖词汇（axios / ai / requireAdapter）的函数标记"依赖人工处理"（不视为校验失败）。
- Entity：`fields` 结构合法（字段类型、引用关系；`tree` 为数据树开关），identifier 唯一。
- 测试数据：字段类型与 Entity tree 一致、引用关系合法、与 fixture 文件一致。
- 应用包：App/Entity/Func/Page/Menu 引用完整（menu 挂载、schema 归属、app 归属）。
- 租户一致性：包内所有记录属于同一租户；导入前校验目标应用包确实属于当前租户。
- 落点：dsh 新增工具包（`packages/*/tool-*`，如 `apppackage_validate`），挂到 `ctx.tools`，校验错误结构化回喂模型。

### 3.6 交付接入（已定：文件为桥头堡 + 采纳后 API 保存）

- 已定模型：dsh 产出 3.1 的应用包目录（文件，可 diff、可审查、可回滚）；**用户审阅并采纳后**，API 保存工具把目录灌入 uicp-server（App → Entity → Func → Menu/Page，创建用 POST、更新用 PATCH）。
- 继续已有应用包时，保存基于"平台 → 目录"同步后的差异生成，避免覆盖平台侧未入库的改动。
- 测试数据仅存本地沙盒（3.11），不随 API 保存写入平台；平台侧验证由人工使用真实业务数据。**平台侧发布回滚暂不考虑**（由平台/人工处理）。
- **用户采纳是写平台的显式闸门**：采纳前 dsh 只写本地文件，不调用任何平台写接口；桌面端提供"采纳/保存到平台"的确认动作。
- API 保存工具需要幂等语义：对比目录与平台差异，逐记录 upsert；平台现有接口按单条 POST/PATCH，无整体导入，可先逐项 upsert，必要时平台侧补批量/幂等导入接口（平台侧建议，见 7）。
- 所有 API 调用以当前租户会话进行（`Authorization` + `Tenant` 头），保存工具拒绝租户不匹配的目录。

### 3.7 预览与局部干预（已定：内嵌 eureka 渲染器 + eureka-editor）

- **预览**：桌面端 Web UI 内嵌 eureka 渲染器，打开应用包目录中的页面 JSON 即实时渲染，替代"去 eureka playground 查看"。
- **预览即本地测试**：内嵌 eureka 渲染的页面，其 `api` 在开发期同源直连本地沙盒（3.11）——用户在预览中直接操作（查询/保存/删除/函数按钮）即为当前场景下的实际交互测试，数据落在按会话组织的沙盒数据区（3.11）；eureka 的 api 经可配置 fetcher 适配（相对路径同源直连，绝对路径在预览上下文改写 base）。
- **局部干预**：同一视图可切换到 eureka-editor（拖拽 + 属性面板的可视化编辑器），用户直接调整页面 JSON；修改写回本地应用包目录（唯一事实源），写回后仍过 3.5 校验。
- 无头渲染/截图仅作 CI 补充（可选，M4），不作为用户预览路径。

### 3.8 dsh 侧交付物清单

- 新 agent preset（含 AppPackage 交付指引）。
- JWT 输入 / Passkey 登录与会话管理：认证入口、Token 安全存储、请求头注入、会话失效处理。
- 租户列表查询工具：登录后展示全部可用租户（每个租户即一个项目），进入即工作；当前租户随打开的租户确定，无需单独绑定。
- 应用包列表与新建工具：租户内选择/新建应用包，绑定对话（新建或继续）。
- 测试数据生成与管理工具：从零搭建时生成 fixture、按会话初始化沙盒数据、随会话删除清理。
- 自动测试工具：基于契约生成正反例/边界用例、沙盒执行、结构化报告、失败回喂模型。
- 本地版本管理工具：快照、切换/回滚、差异查看。
- 壳层主题：沿用 dsh 现有主题（3.9）。
- 壳原生桥面：凭证存储、Passkey 认证、托盘/通知、外链打开（3.16）。
- 上游同步辅助脚本：共享文件清单检查、本地补丁重放。
- skill/知识包（3.3）。
- 校验工具包与 API 保存工具（3.5 / 3.6）。
- 跨应用依赖动态分析与目标校验（3.14，从产物识别）。
- 基于 dsh Web UI 的最小改造集成：新增 client 插件（登录 / 租户导航 / 产物工作区）+ 适配层（3.9 / D18 修订）。
- 测试：工具单测 + keyless 快照 + 文档（中英）+ Agent Note。
- 全部落在扩展点（preset/skill/tool/webserver 路由/client 插件），不改 agent-loop 与核心包。

### 3.9 桌面应用形态

- dsh 以桌面应用交付：本地 host 服务（`dsh web` 的现有链路）由桌面壳托管，dsh Web UI 在嵌入式 webview 中运行（基于 dsh Web UI + 最小改造，D18 修订）。
- 桌面壳**已定 Tauri v2**（macOS 用系统 WKWebView 与原生窗口，最贴合系统体验；Windows 用 WebView2）；Electron 仅在 Tauri 遇到不可接受的工程障碍时作为后备评估（不阻塞方案）。选型见决策点 D7。
- 桌面壳以 sidecar 方式拉起 dsh 本地进程（`dsh web` 链路），等待端口就绪后 webview 指向 `127.0.0.1:<port>`；端口可配置（0 表示由 OS 分配，见 `packages/bundle/web-app` 的 `webStartup.port`）。
- **Web UI 加载方式（已定，D19）**：localhost HTTP——一个本地 HTTP 服务三合一（dsh Web UI 页面 + RPC/事件流 + 沙盒 API），webview 指向 `127.0.0.1:<port>`；host 组成见 3.15（含 dsh Web UI 栈）；壳负责拉起与守护进程。
- 认证为 JWT 输入为主、Passkey 可选增强（3.2）：Passkey 需壳层 native command 调系统认证器（macOS AuthenticationServices / Windows WebAuthn）；WKWebView 的 WebAuthn 受限，故不经 webview 直连；native 桥可行性属平台对接外部项，以 JWT 兜底。
- Token 与租户绑定存桌面安全存储（如系统钥匙串/安全存储），替代 localStorage/sessionStorage；会话恢复、失效重输流程与 web-admin 一致。
- **界面风格（已定，D14 修订）**：放弃 Codex 风格，界面沿用 dsh Web UI 原生风格；D17 导航结构以零修改妥协版实现（见 D17）。
- **导航结构（已定，D17 修订：零修改妥协版）**：
  - 侧栏浏览区（替换 `sidebar.workspaces` 槽，自建）：租户 → 应用包 → 会话 三级，分区"当前 / 最近 / 全部"（全部默认折叠、虚拟滚动）；分层懒加载（租户按需加载，展开租户才加载应用包与会话）；无全局搜索；
  - 会话切换：以侧栏会话列表为主；会话头添加 additive 动作按钮（`conversation.session.header.actions`）弹出会话选择器作为辅助入口（无主区常驻 tabs）；
  - 主区为对话内容（主导宽度）；右侧为可开关的产物工作区（替换 `details` 槽，tabs：渲染预览 / 可视化编辑 / 原始 JSON / 测试 / 版本）；
  - 联动：选中会话 / 产物自动更新上下文，对话引用产物可跳转，布局状态按会话记忆；
  - 零上游修改：全部通过既有插槽替换 / 叠加实现（`sidebar.workspaces`、`conversation.session.header.actions`、`details`），替换在装配层完成，不改上游文件。
- **零修改确认（D17，已确认）**：实现仅涉及新增 client 插件与自有 bundle 装配层（行级排除上游 occupant、注册自有 occupant），上游文件零改动；上游同步时相关包照常跟随，冲突为零。
- **UI 策略（已定，D18 修订）**：基于 dsh Web UI + 最小改造，放弃 Codex 风格；我们的功能（登录、租户/应用包/会话导航、会话头切换按钮、产物工作区、eureka 嵌入）全部为新增 client 插件（`dsh.client` + ui-slots 注册），不改上游文件；不可避免的上游修改收敛为极小补丁 + 重放（第 5 节）；import 上游组件集中经过适配层（`our-ui/adapter`），上游接口变更时仅修适配层。
- 桌面化附带工作：应用打包与签名、自动启动本地服务、窗口/托盘管理、dsh 自身更新分发。
- **单机单用户模型（已定）**：本地文件桥头堡为单机事实源，不涉及多人 / 多机协作。

### 3.10 eureka 依赖集成

- dsh 引入 eureka 相关包作为依赖：`eureka`、`eureka-core`、`eureka-ui`、`eureka-formula`、`eureka-editor`、`eureka-editor-core`。
- 依赖来源：私有 registry `http://192.168.1.2:11608/`（各包 publishConfig），开发期可用本地 workspace 链接替代；均为 ESM 库、React 18 兼容、exports 完整（`dist` 与 `schema.json`）。
- 接入点：Web UI 新增"预览/编辑器"视图，承载 3.7 的渲染与编辑；eureka-ui 的 SCSS 主题（`dist/themes`）随视图按需引入。
- 体积与性能：eureka/eureka-editor 依赖 monaco-editor，按独立 chunk 懒加载，不进入主包；编辑器仅在使用时装载。
- 版本同步：跟随 eureka 私有 registry 的发布版本升级，升级脚本与 schema.json 同步机制共用（见 6 可持续性）。
- 集成契约：按 eureka 官方示例（examples、docs/start/getting-started）组装渲染器/编辑器；构建验收在 M2；若内嵌共存受阻，降级为独立 webview/iframe 承载预览/编辑（预案，消除对内嵌必然成功的依赖）。

### 3.11 本地验证沙盒（数据交互与 uicp-server 一致）

- **保真范围（已定）**：JSON 页面是数据的核心产出与消费端口，沙盒只需为其提供仿真的数据交互——**数据保存（CRUD）、查询（查询符 + stats + 树形）、函数执行**；三类交互以轻量仿制实现，呈现结果与 API 效果一致即可视为沙盒可靠，通过其验证即可发布。
- **发布边界**：发布（API 保存）是最后一步，dsh 不做自动化平台冒烟；发布后由人工在平台侧走快乐路径兜底（非 dsh 自动化流程）。
- **仿真路线（已定：行为复刻，D15）**：dsh 自研沙盒实现——查询组装（2.6）、字段操作符、函数执行上下文（2.2）、数据层（本地存储）均按平台契约复刻，不依赖平台仓库、不照搬实现；保真范围收敛为页面消费的三类数据交互（本节约）。
- **技术路线（方向，基于 dsh 代码调研）**：
  1. 承载与路由：新增 host 插件在 `ctx.webServer` 注册 `/app-package/entity/...` 前缀路由（`packages/host/webserver` 的 `register(route)`，同源免 CORS）；请求处理仿照 `packages/client/connection` 的 rpc 桥模式（raw req/res → Fetch → `request.json()` 解析 → JSON 响应），实现 list/page/tree/CRUD/stats/func 的 REST 语义；
  2. 数据层：复用 `ctx.storage`（storage 中心，sqlite/json 后端），沙盒集合 = 一个 storage 单元（document-per-row KV），数据落应用包目录 `data/`（按会话独立分区），fixture 初始化、可重置；JSON 后端文件可 diff，配合 3.13 版本管理；
  3. 查询引擎：按 2.6 契约自研（参数规范化、like 正则、18 个操作符与类型转换、`_sort`/`_preventListAll`），在 KV 上以全量加载 + 内存过滤/排序实现（本地数据量小），行为矩阵契约测试锁定；
  4. 函数执行器：镜像 `packages/workflow/workflow-worker-thread` 的 vm 沙箱模式（`new vm.Script('(async () => { body })()')` + `vm.createContext` + 冻结注入函数 + worker 隔离 + 预解析/预算/取消），注入内部词汇（getColl→本地数据、ObjectId、dayjs、Decimal、crypto、Buffer、__funcExecutor 递归、reportError/reportService、__env）；**外部依赖词汇（axios、ai、requireAdapter 等）不注入、不支持、不 mock**，由用户协作阶段确认（本节约）；
  5. 测试与契约：tool 包生成正反例/边界/查询符矩阵用例调沙盒执行、结构化报告回喂；同一语料跑沙盒 vs 真实平台（远程 API/基准环境）的行为矩阵契约测试，作为发布前保真闸门。
- **查询引擎质量关卡（已定）**：查询实现生成/修改后依次过——代码语法检查 → LLM 审查 Mongo 查询语法与语义 → 仍不确定时人工审查；该关卡是静态质量防线（抓语法与明显语义错误），行为等价的最终闸门仍为行为矩阵契约测试（对真实平台基准）。
- 页面 `api` 在开发期指向本地沙盒（运行时改写 base URL），采纳保存后指向真实平台；两者路径约定一致（同为 `/app-package/entity/:identifier/...`），页面 JSON 无需为环境改写。
- **镜像查询契约（2.6）**：操作符清单、类型转换、like 正则转义、in/between 逗号分隔、`_sort` 与 `_preventListAll` 语义以平台实测行为为准，契约测试锁定一致性。
- **已定：镜像函数执行模型**（vm 沙箱 + 2.2 上下文词汇），`getColl` 等指向本地数据存储；dsh 在本地沙盒运行函数、观察结果、迭代修改，含镜像构造函数在落库前的生命周期语义（2.2）。
- **外部依赖词汇（已定）**：axios、ai、requireAdapter（及消息/物流适配器等）在沙盒中**不注入、不支持、不 mock**；使用这些词汇的函数标记为"依赖人工处理"，由用户在协作阶段实际使用 / 真实环境验证后确认。
- **文件上传（已定）**：沙盒以 mock 支持上传类交互（不执行真实上传），上传组件在预览中可用但结果落 mock。
- **沙盒数据组织与清理（已定）**：沙盒数据按**会话**独立分区（新会话以 fixture 初始化）；**删除会话即清理其沙盒数据**（随会话删除联动清理）。
- **函数执行错误语义（已核实）**：函数正常返回对象 → 原样转发为响应；返回 undefined → 默认 `{status:0,data:{},msg:null}`；函数 throw → 平台记错误日志并响应 `{data: err.message, msg:"操作失败", status:500}`（`execFuncSync` 只记日志不响应）；构造函数 throw 或返回非 0 → 保存中止、不落库。沙盒镜像以上语义。
- **响应格式（已核实）**：沙盒返回 JSON `{status,msg,data}`；eureka 解析为 `status == 0` 成功（宽松相等、缺 status 视为 ok、兼容 errorCode/errno 等格式），错误时展示 msg——与 2.3 契约精确匹配。
- 一致性保障：用同一请求语料与函数用例对沙盒和真实 uicp-server 做契约测试（行为矩阵），锁定数据 API 面与函数执行结果的一致性；**契约测试是发布前必过的保真闸门**。契约测试的基准为真实平台（远程 API 或平台维护方提供的基准环境）。沙盒只用于开发期，永不是生产路径。

### 3.12 自动测试（不只快乐路径）

- dsh 在开发期自动测试生成的业务功能：基于 Entity tree 与 Func 定义自动生成测试用例，在本地沙盒（3.11）执行，结构化报告结果并回喂模型迭代（失败 → 修复 → 重跑）。
- 覆盖要求（**不只快乐路径**）：
  - 正例：标准 CRUD、函数正常返回、页面数据链路可用；
  - 反例：非法/缺失/越界输入、类型错误、非法 identifier、引用不存在、跨租户访问被拒（权限模型开发调试阶段不处理，见 3.4）；
  - 边界：空数据、分页边界、字符串/数值边界、删除被引用记录、重复插入；
  - 查询操作符：各操作符（2.6）正反例、`>` 转义与未知操作符回退、空值/空操作符值段跳过、`_preventListAll` 拦截、`_sort` 方向与字段校验、stats（count/sum）与树形（tree/branch）接口正反例；
  - 构造函数：单条 insert 落库前执行、字段加工/默认值生效；返回非 0 时保存中止且无落库；批量 insertBatch 不触发构造函数；
  - 外部依赖函数：使用 axios / ai / requireAdapter 的函数不进入自动测试，标记"依赖人工处理"；
  - 契约：接口返回 `{ status, msg, data }`，错误码与提示符合平台约定。
- 用例来源：规则模板 + 基于 Entity tree/Func 签名的参数化生成，fixture 保证可复现；用例随应用包目录沉淀（`tests/`），可审阅、可扩展。
- **发布门槛**：静态校验（3.5）+ 自动测试全绿 + 沙盒与平台契约一致性检查 + 用户采纳，四者齐备才允许 API 保存；**API 保存是最后一步**，保存后不再执行平台冒烟。
- **未覆盖项处理**：使用外部依赖词汇（axios / ai / requireAdapter）的函数标记"依赖人工处理"（3.11），由用户在协作阶段实际使用 / 真实环境验证后确认；测试数据仅存本地沙盒，随会话删除清理。
- **发布后人工兜底**：平台侧人工快乐路径验证（保存 / 查询 / 函数执行各走一遍主流程），由用户执行，不属于 dsh 自动化发布流程。
- **用户协作即持续验证（已定）**：用户在与 dsh 协作过程中实际使用产物（预览、测试、反馈），构成持续验证回路；发现的问题反馈进入修正循环，覆盖行为矩阵与自动测试之外的行为。

### 3.13 本地轻量版本管理

- **对象**：应用包目录内的所有产物文件——`funcs/**/*.js` 与 `entities/`、`pages/`、`menus.json`、`app.json`、测试数据 fixture（不含沙盒运行时数据；沙盒数据随会话组织与清理，见 3.11）。
- **快照**：dsh 在关键节点自动打快照（生成完成、eureka-editor 干预写回、采纳前、平台 → 目录同步前），用户也可手动打点并命名；快照存 `versions/<version>/`（先按完整拷贝，保留上限参数化，防止目录膨胀）。
- **切换**：UI 选择历史版本 → 查看差异 → 一键恢复为当前工作区；切换后重新过 3.5 校验，可重跑 3.12 测试验证回滚状态。
- **语义边界**：切换只影响本地工作区，不触碰平台；平台 `PageVersion` 是已入库历史，与本地草稿快照不互相同步。
- **与平台同步的关系**：执行"平台 → 目录"同步前先打快照，防止拉取覆盖本地未采纳改动。

### 3.14 跨应用互动（设计）

- **互动形态**：数据级（A 应用页面/函数引用 B 应用实体数据）、函数级（A 应用函数调用 B 应用函数）、页面级（A 应用页面 `api` 指向 B 应用实体接口）。
- **依赖动态识别（不设静态清单）**：平台与用户都没有预声明机制，人工维护清单会随业务发展失准漂移——因此 dsh 不声明、不手工维护依赖；改为**从产物主动分析**：解析页面 JSON（`api` 中的 `/app-package/entity/:identifier/...` 引用）与 Func body（`getColl` / `__funcExecutor` 调用）提取 identifier，经当前租户"实体 → 应用"归属映射差分（排除本应用包自身）后，动态得出跨应用依赖。产物变更，依赖随分析自动更新，天然防漂移。
- **用户主动发起 = 生成引用**：用户要求"把 A 的页面接到 B 的订单数据"时，dsh 在产物中生成对应引用（页面 api / 函数调用），分析器随后的识别自然建立依赖——发起动作与识别机制解耦。
- **归属映射来源**："实体 → 应用"归属来自"平台 → 目录"同步拉取的租户实体清单，或沙盒/基准环境查询；分析结果可作为派生缓存（随产物快照），但始终以重新分析为准。
- **技术落点**：分析器并入 `apppackage_validate`（3.5），扫描页面 JSON 与 Func body 的引用点。
- **校验（3.5 扩展）**：按分析出的跨应用引用校验目标存在（同租户 identifier 全局唯一）、租户一致、无悬空引用；分析覆盖不到的模式（如动态拼接的 identifier）显式标记，发布前由用户确认。
- **发布（3.6 扩展）**：保存前校验目标应用已存在（同租户）或提示先发布目标；分析结果仅用于提示发布顺序，无依赖的应用包不受影响。
- **沙盒（3.11 扩展）**：按分析结果装载外部目标实体/函数，模拟同租户多应用共存，跨应用引用照常解析；跨租户 `getColl` 默认不生成，需要时显式标记"本地未验证"并经用户确认。
- **测试（3.12 扩展）**：跨应用用例——A 读 B 数据、A 调 B 函数、目标缺失的错误路径。
- **版本（3.13 扩展）**：分析结果随产物快照缓存，切换版本时重新分析并校验依赖一致性。
- **安全边界**：dsh 生成的跨应用引用限定在同一租户内；跨租户访问仅作显式高级能力，默认不生成。

### 3.15 host 组成与传输面（基于 dsh Web UI）

- **目标**：复用 dsh Web UI，用最小改造承载全部功能；体积与复杂度通过 Tauri 壳、端点裁剪与懒加载控制（"最小 host 只留核心"让位于 UI 复用，是 D18 修订的固有代价）。
- **保留**：core（agent、agent-loop、session、system-prompt、tools、scope）、session 持久化、fs、subprocess/shell、credentials、jobs、app-boot/boot、webserver、connection（host 半）、**dsh Web UI 栈（apps/web、client 包、frontend-static）**、沙盒（自研 host 插件）。
- **新增**：我们的 client 插件（登录 JWT/Passkey、租户/应用包/会话导航、产物工作区、eureka 嵌入）+ 适配层（`our-ui/adapter`，import 收口）。
- **传输面端点（最小集合）**：dsh Web UI 静态页、RPC（`/api`）、事件流（WS downlink）、沙盒 API（`/app-package/...`）；其余 dsh 端点按需裁剪。
- **轻量化**：Tauri 壳小体积、monaco 懒加载、非必需端点裁剪；上游同步范围 = 核心 + Web UI（跟随），冲突面控制在适配层与补丁清单（第 5 节）。

### 3.16 壳原生桥面清单（已定，D20）

- **凭证存储**：Token 安全存取（macOS Keychain / Windows DPAPI / 未来 Linux Secret Service）；仅 `set` / `get` / `delete` 三个命令；Token 不进 Web UI 存储（localStorage/sessionStorage）。
- **Passkey 认证（可选增强）**：native WebAuthn（macOS AuthenticationServices / Windows WebAuthn），完成断言后把 credential 交 Web UI 提交平台；仅在用户主动触发 Passkey 登录时调用。
- **托盘与通知**：Tauri 内置托盘 + 通知插件（后台运行、任务完成提醒、退出确认）。
- **外链打开**：tauri-plugin-opener 在系统浏览器打开外部链接（平台控制台、文档等）。
- **不进桥（web 侧解决）**：剪贴板、系统深色模式跟随（`prefers-color-scheme`）等。
- **边界原则**：能 web 侧做的不进桥；能复用 dsh 的不重复实现；平台差异收敛在壳 command 层。

### 3.17 进程生命周期（已定，D21）

- **启动序列**：壳 spawn dsh 进程（sidecar）→ 端口就绪探测（健康端点）→ webview 加载 `http://127.0.0.1:<port>` → 显示 UI。
- **崩溃恢复**：child exit 事件 + 探活，自动重启（指数退避，防崩溃风暴）；重启后会话从持久化恢复，当前对话可刷新重连。
- **退出联动**：壳退出 → SIGTERM 优雅关闭 → 超时强制；dsh 进程孤儿保护（父进程死亡自退出）。
- **单实例**：Tauri single-instance，第二实例激活首窗口；端口配 0（OS 分配）避免冲突。
- **日志**：dsh stdout/stderr 落壳日志文件，不上 UI。

### 3.18 打包与分发（已定，D22）

- macOS：Developer ID 签名 + 公证（notarization）→ dmg。
- Windows：Authenticode 代码签名 → NSIS/MSI。
- 更新：Tauri updater（签名更新通道）。
- 资源与版本：dsh 作为 sidecar 资源随壳打包；壳版本与内置 dsh 版本绑定发布；每次上游同步后重建 sidecar 资源（sidecar 打包 Node 22 运行时，arm64/x64 双架构，为工程验收项，M0 打包时确认）。

## 4. 实施阶段

- M0 桌面壳 + UI 集成原型：Tauri 壳 + dsh Web UI 加载，打通"JWT 输入 → 校验 → 列租户 → 进入租户 → 选择/新建应用包 → 开始对话"（Passkey 为可选增强，如启用则一并验收）；验收清单：
  - localhost HTTP 三合一加载（D19）与 dsh Web UI 集成（client 插件 / 适配层，D18 修订）；
  - JWT 输入为主路径；Passkey native 桥（可选增强，D20）如启用则验收；
  - 进程守护基础：拉起 / 端口就绪 / 退出联动 / 单实例（D21）；
  - 交付：可运行的桌面应用骨架（功能闭环由 M1–M3 完成）。
- M1 契约冻结：确定 3.1 目录结构与字段映射（含租户维度），产出示例应用包（1 个租户 + 1 个 App + 1 个 Entity + 2 个 Function + 1 个列表页 + 测试数据 fixture），人工导入平台验证可行。
- M2 知识注入 + 预览：preset + skill 上线，agent 能按契约生成示例包；加入页面 JSON 与 Func body 校验；内嵌 eureka 渲染器，页面 JSON 可预览（fixture 数据）。
- M3 闭环 + 局部干预 + 自动测试 + 版本管理：校验工具、API 保存（导入桥）、错误回喂迭代；接入 eureka-editor、本地验证沙盒与版本快照/切换，自动测试覆盖正反例与边界；跑通"需求 → 生成 → 校验 → 预览/干预 → 自动测试 → 采纳 → 保存到平台 → 平台可运行"。
- M4 硬化：快照测试/文档、无头渲染校验（可选）、契约保真与测试用例沉淀、长期维护脚本（schema 与 eureka 版本同步等）。

## 5. 上游同步与合并策略

- 目标：持续接收上游（deepseek-ai/deepseek-harness）核心功能更新，最小化后续合并工作量。
- **UI 集成策略（D18 修订）**：UI 跟随上游（基于 dsh Web UI）；我们的功能全部为新增 client 插件（slots 注册），不改上游文件；不可避免的上游修改收敛为极小补丁 + 补丁重放；import 集中经过适配层收口；上游同步范围 = 核心 + Web UI（跟随），冲突面控制在适配层与补丁清单。
- **改动分离是主线**：dsh 改造全部落在扩展点——新增 preset、skill、工具包与配置文件；不改动上游核心包（agent-loop、core、client shell 等）。上游合并时绝大多数为"新增文件 + 无冲突"。
- **新增优先于修改**：新代码放独立包/目录（如 `packages/eureka/*`、`apps/cli/config/agent-presets/` 新增目录）；避免编辑上游已有文件；确需修改的共享文件集中在固定清单（pnpm-workspace.yaml、tsconfig.host.json / tsconfig.client.json、根 package.json、docs 导航），改动保持最小并记录在案。
- **共享文件合并预案**：每次同步前对照清单检查；冲突按"先取上游、再重放本地补丁"处理，本地补丁脚本化、可重放，不靠手工解决后丢失。
- **依赖隔离**：eureka 私有 registry 依赖只出现在新增包中，不写入上游包的 package.json；workspace 注册集中到 pnpm-workspace.yaml。
- **同步节奏与验证**：定期 fetch 上游并合并到维护分支；合并后跑 `pnpm install && pnpm run typecheck && pnpm run test` 与本项目 smoke；按 AGENTS.md，合并与提交前先征求用户同意。
- **门禁义务**：新增包必须通过上游既有门禁（workspace constraints、knip、doc-sync、coverage），避免合并后因门禁修复产生额外工作量。

## 6. 短期与长期价值

- 短期：M1/M2 让 dsh 能产出可导入的示例应用包，验证"JSON 驱动开发"闭环，不改平台代码即可试用。
- 长期：应用包目录成为"应用即代码"资产（git 可管理、可审查、可回滚）；dsh 校验与知识库沉淀后，可反向驱动平台能力补齐（如生命周期钩子行为对齐）；导入桥与 API 直驱共用中间表示，平台演进不推翻生成器；租户维度进入目录结构后，多租户环境下的生成、审查、回滚都按租户隔离。
- 可持续：契约以数据依赖引用平台构建产物（schema.json）与领域源码，提供同步脚本；沙盒按契约自研（行为复刻），不依赖平台仓库，一致性由行为矩阵契约测试锁定。

## 7. 决策点与风险

已定：

- D1 本地文件为协作桥头堡与唯一事实源，用户采纳后调用 API 保存更新（见 3.6）。
- D2 构造函数：数据落库前的生命周期钩子（uicp-server `DataCmdApp.insert`），沙盒镜像该机制并纳入测试（见 2.2 / 3.11 / 3.12）。
- D3 桌面端内嵌 eureka 渲染器预览 + eureka-editor 局部干预，无头渲染仅作 CI 补充（见 3.7）。
- D4 知识注入深度：preset 承载行为规则 + skill 承载契约词汇（按需查询），校验工具兜底（见 3.3）。
- D5 Token 持久化：启动自动恢复（钥匙串） + 失效重输（见 3.2）。
- D6 认证方式：手动输入 JWT 为主路径，Passkey 为可选增强（平台接口与约束已核实），两者最终产出平台 Token（JWT）作为所有平台 API 请求的必须参数（见 2.5 / 3.2）。
- D7 桌面壳已定 Tauri v2（macOS 原生体验最优）；Electron 仅为不可接受障碍时的后备评估，不再以 M0 验证为前提。
- D8 租户（项目）下按应用包组织，选择应用包后新建或继续对话（见 3.2）。
- D10 本地沙盒镜像数据 CRUD + 函数执行模型，函数在本地验证与迭代（见 3.11）。
- D11 自动测试覆盖正例、反例与边界（不只快乐路径），本地沙盒全量执行后由用户采纳，API 保存为最后一步（见 3.12）。
- D12 本地轻量版本管理：自动快照 + 手动打点，可切换/回滚，保留策略参数化（见 3.13）。
- D13 上游同步策略：改动落在扩展点、新增优先于修改、共享文件清单化 + 补丁重放（见 5）。
- D14 界面策略（修订）：放弃 Codex 风格，界面沿用 dsh Web UI 原生风格；D17 导航结构以零修改妥协版实现（见 3.9）。
- D15 沙盒仿真路线：行为复刻（自研实现 + 行为矩阵契约测试锁定一致性），不依赖平台仓库（见 3.11）。
- D16 跨应用互动：同租户内 identifier 直引；依赖从产物动态分析识别（不设静态清单，防漂移），跨租户访问默认禁止、显式启用并标记本地未验证（见 3.14）。
- D17 壳导航结构（零修改妥协版，已确认零上游修改）：侧栏浏览区（租户→应用包→会话，当前/最近/全部、懒加载、虚拟滚动）+ 会话头 additive 切换按钮 + 可开关产物工作区；无全局搜索（见 3.9）。
- D18 UI 策略（修订）：基于 dsh Web UI + 最小改造——功能全部为新增 client 插件，上游修改收敛为极小补丁 + 重放，import 经适配层收口（见 3.9 / 第 5 节）。
- D19 Web UI 加载方式：localhost HTTP——单本地 HTTP 服务三合一（dsh Web UI + RPC/事件流 + 沙盒 API），host 组成见 3.15（见 3.9）。
- D20 壳原生桥面清单：凭证存储（Keychain/DPAPI）、Passkey 认证（可选增强，native WebAuthn）、托盘/通知、外链打开；其余 web 侧解决（见 3.16）。
- D21 进程生命周期：sidecar spawn + 端口就绪探测 + 崩溃自动重启（退避）+ 退出联动 + 单实例 + 日志落文件（见 3.17）。
- D22 打包与分发：macOS 签名/公证 + dmg、Windows Authenticode + NSIS/MSI、Tauri updater；dsh 作为 sidecar 资源与壳绑定发布（见 3.18）。

- 风险：**平台已通过线上大量真实业务验证，平台侧行为问题由平台维护方负责修复，不作为 dsh 风险项**（沙盒与平台一致性仍由契约测试锁定）；Eureka schema 与平台字段是演进中的构建产物，需同步机制；Func 沙箱安全边界由平台承担，dsh 不绕过；大量字段知识注入可能膨胀上下文，优先按需查询；跨租户误操作是最高优先级风险，任何产物操作先校验租户归属；Token 是平台访问凭证，存储与传输安全由 dsh 安全存储承担，禁止写入日志与产物；未采纳前不写平台，API 保存需幂等，避免部分导入失败留下半成品；测试数据仅存本地沙盒、不写入平台，无生产库污染面，沙盒数据按会话组织、删除会话即清理；**无自动化平台冒烟，沙盒保真度是发布可靠性的主要保障**：保真范围 = JSON 页面消费的数据交互（数据保存、查询〔含 stats/树形〕、函数执行），轻量仿制需呈现结果与 API 效果一致；契约测试（行为矩阵）按此范围锁住一致性，覆盖清单须可从 uicp-server 源码对照生成，使用外部依赖词汇的函数由用户协作阶段验证；**契约测试依赖真实平台基准环境**（远程 API 测试租户或平台方基准实例），基准不可得则保真闸门失效；发布后以平台侧人工快乐路径兜底（非自动化，覆盖范围有限），**用户协作阶段的实际使用与反馈构成持续验证回路，覆盖行为矩阵之外的行为**；自动测试用例需与平台契约同步维护，防止用例漂移或假绿；跨应用依赖由产物动态分析识别（防清单漂移），发布前校验目标存在（同租户），防止悬空 identifier，分析覆盖不到的模式须显式标记，跨租户访问默认禁止、显式启用并标记本地未验证；本地版本快照需设保留上限，防止目录膨胀，与 git 并存时职责边界清晰（快照管草稿节点、git 管提交历史）；平台侧发布回滚暂不考虑（由平台/人工处理）；上游合并冲突集中在共享文件清单，需补丁重放而非手工覆盖，且新增包必须通过上游门禁，防止同步后产生连带修复成本；eureka/eureka-editor 依赖 monaco 等重型依赖，需懒加载隔离，且编辑器写回的 JSON 必须重新过校验，防止可视化干预破坏契约。

## 8. 方案可行性验证（dsh 代码对照，2026-08-14）

| 方案能力 | dsh 机制（代码位置） | 结论 |
| --- | --- | --- |
| 桌面壳托管 Web UI | `apps/web`（vite 构建）+ `apps/cli` `dsh web`；`packages/bundle/web-app` 默认端口 3080、可配 0（OS 分配） | 可行 |
| 本地沙盒（本地 HTTP 服务） | `packages/host/webserver` `ctx.webServer.register(route)`，host 插件注册 `/app-package/...` 路由（同源免 CORS） | 可行（新增 host 插件） |
| 知识注入（preset + skill） | `packages/preset/agent-presets`（roster/mount）+ `packages/skill`（ctx.skills + tool-skill）；preset 目录 `apps/cli/config/agent-presets/` | 可行 |
| 新工具（校验/测试/租户列表/API 保存） | `packages/core/tools` `ctx.tools.register(ToolDefinition)` 全流水线（pre-execute/guard/execute/post-execute） | 可行 |
| Token 存储 | `packages/credentials` seam；桌面安全存储由壳层提供（钥匙串/stronghold） | 可行 |
| Passkey 登录（可选增强） | 平台接口与约束已核实（2.5：@simplewebauthn/server、RP_ID=underwork.cn、origin 限 underwork.cn 域）；native 桥属平台对接外部项 | JWT 为主路径，Passkey 可选 |
| 基于 dsh Web UI 承载 eureka 预览/编辑 | dsh client 插件机制（dsh.client.inject, platform web）+ ui-slots + apps/web vite 别名；Eureka 渲染/编辑为新增 client 视图（D18 修订） | 可行 |
| 对话与继续 | `packages/session` 持久化（JSONL/SQLite，`~/.dsh/sessions`）+ agent inbox | 可行 |
| 后台长任务 | `packages/jobs` + tool-jobs | 可行 |
| 本地文件桥头堡 | `packages/fs` tool-fs（read/write/edit）+ fs-sandbox（workspace-write） | 可行 |
| 平台 API 调用 | Web UI 直接 fetch（平台已支持浏览器跨域，web-admin 同模型），带 Authorization + Tenant 头 | 可行 |

结论：方案所需能力全部落在 dsh 既有扩展点（preset/skill/tool/webserver 路由/client 插件），无需修改 agent-loop 与核心包，第 5 节上游同步策略成立（UI 基于 dsh Web UI 跟随上游，冲突面控制在适配层与补丁清单）。验证中补充了四处机制澄清（3.2 平台 API 路径、3.9 壳拉起进程与端口、3.11 沙盒路由承载、Token 安全存储载体），方案无功能漂移。
