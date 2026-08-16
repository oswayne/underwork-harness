---
name: uicp-contract
description: Use when generating, validating, or publishing UICP low-code platform app packages, including Entity/Function/Page/Menu records, platform API mapping, sandbox vocabulary, and query contracts.
---

# UICP App-Package Contract

The app-package directory is the bridgehead and single source of truth between dsh and the user: dsh only generates and iterates on this directory, the user reviews and adopts it, and the platform is written only after adoption via API save. The authoritative contract is [app-packages/README.md](../../../app-packages/README.md); this skill is the lookup summary, not a second source of truth.

## Directory layout

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

Local files reference each other by identifier only and never carry platform ObjectIds; the publish tool maps identifiers to ObjectIds.

## Platform records and APIs

- App: `POST /app-package`; fields name / identifier / description / version / available / hidden / type / url / portable / category / runtime / requireRoles / requirePermissions. There is no `trade` field (industry is `category`).
- Entity: `POST /app-package/entity`; Schema records carry name / category / identifier / description / version / `tree` (boolean data-tree switch) / extra / app. Fields are separate records created via `POST /app-package/entity/field` with `entity` (Schema ObjectId), name, label, type, unique, editable, comment. Field types: `文本` / `ObjectId` / `数字` / `对象` / `日期` / `日期时间` / `布尔`.
- Function: `POST /app-package/entity/func` with `entity` (Schema ObjectId), identifier, name, comment, body, type (`static` / `object` / `constructor`). Constructor functions run before data insert for single inserts only.
- Menu: `POST /app-package/menu`; flat records (group / name / path / icon / sort / hidden / requireRoles / requirePermissions). Page mounts via `POST /app-package/menu/:id/page` whose request body is the page JSON itself; `GET /app-package/menu/:id/page` returns the parsed page JSON.
- Data: `POST /app-package/entity/:identifier` (create), page/list/tree/stats under `/app-package/entity/:identifier/...`; responses are `{ status, msg, data }` and paged lists are `{ data: { items, total, page } }`. Use `/app-package/entity/...` paths directly; `/lowcode/form/schema/...` is a frontend gateway rewrite.

## Sandbox vocabulary

Internal: `getColl` / `ObjectId` / `dayjs` / `crypto` / `Buffer` / `Decimal` / `console` / `__env` / `__funcExecutor` / `reportError` / `reportService` plus request-injected `body` / `query` / `session`. External (`axios` / `ai` / `requireAdapter`) is not supported: mark such functions "manual handling required".

## Query contract

Bracket keys flatten to dot paths; `?field=value` is a case-insensitive `like`; `?field=operator>value` dispatches to `like` / `notLike` / `isNull` / `isNotNull` / `isBlank` / `isNotBlank` / `in` / `notIn` / `eq` / `ne` / `gt` / `ge` / `gte` / `lt` / `le` / `lte` / `between` / `notBetween`; multi-values are comma-separated; `_sort=field>asc,...`; `_preventListAll=true` rejects empty-filter full lists.
