# Agent Note: 收敛 UICP seam 的 HTTP 与认证助手

Status: proposed

[English](2026-08-23-shared-uicp-seam-helpers.md) | 中文

## 问题

fork 的 uicp host 插件在每个包里手写了相同的 HTTP/认证机制：

- `bearerToken` 存在三份：`packages/uicp/preview-backend/src/index.ts:40` 的私有副本、`packages/uicp/user-identity/src/index.ts:67` 的导出副本、`packages/uicp/project-git` 的消费导入。
- `readJsonBody` 在 `preview-backend` 与 `project-git` 中重复。
- `json = (status, body)` 响应闭包在每个处理器里重复定义——仅 `preview-backend` 就有 7 份，`user-identity` 与 `project-git` 各有一份，且 401 响应体略不一致。
- 防御性三元 `error instanceof Error ? error.message : String(error)` 在约 13 行重复，各自携带一条 `v8 ignore` 理由。

所有消费者都是 fork 自有包的生产路由，无需改动上游文件。

## 提案

新增一个 fork 自有助手包（如 `packages/uicp/seam-http`），导出：

- `bearerToken(req)` 与 `requireUser(req, respond)`（返回按用户键或回答统一 401）；
- `readJsonBody(req)`；
- `respond(res, status, body)`；
- `errorMessage(error)`，用一条 `v8 ignore` 说明这些 catch 只可能收到 `Error` 实例。

改写 `preview-backend`、`user-identity`、`project-git` 消费这些助手，删除本地副本，并把重复的 `v8 ignore` 理由收敛到一处。

## 备选方案

副本都很小（各 8–15 行），且各包 401 响应体目前不一致（`preview-backend` 为 "missing platform token"，其余为 "platform rejected the token"）。保留本地副本可以避免新增 workspace 包及其锁文件条目；但代价已经可见：7 个相同的响应闭包、三份 bearer 解析、约 13 条各自漂移的 ignore 理由。

## 验收标准

- 三个 uicp host 包改为导入助手，不再包含本地 `bearerToken`/`readJsonBody`/`json` 副本。
- 所有路由测试通过；seam 的 401 响应体统一为同一形态。
- `pnpm run hygiene`、`lint` 与各包 100% 覆盖率保持绿色；新包按其他 uicp 包同样登记到 `tsconfig.base.json`/`tsconfig.host.json`。

## 风险

新包增加上游合并面，但完全位于 fork 自有 `packages/uicp/`，沿用现有逐包登记模式。401 响应体统一只影响解析 `msg` 的客户端；web 客户端只检查状态码。
