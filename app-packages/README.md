# App-package directory contract (frozen at M1)

English | [中文](README.zh.md)

The app-package directory is the bridgehead and single source of truth for collaboration between dsh and the user: dsh only generates and iterates on this directory, the user reviews and adopts it, and the platform is written only after adoption via API save (save is the last step). This contract was frozen against the uicp-server source on 2026-08-16; the corrections to the design documents are listed below.

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

## File format and naming

- JSON files are UTF-8, two-space indented, and end with exactly one trailing newline.
- All identifiers are lowercase kebab-case (the platform lowercases Entity identifiers on create).
- Local files never carry platform `_id` values; cross-record references always use identifiers (entity / function / page / menu), mapped by the save tool to platform ObjectIds.
- Field type enum (platform `Field.type`): `文本` / `ObjectId` / `数字` / `对象` / `日期` / `日期时间` / `布尔`.

## File specifications

- `tenant.json`: records only `identifier` / `name` / `available`; tenant configuration is not copied. The actual tenant ObjectId comes from `GET /systemctl/tenant/list`.
- `app.json`: App record fields `name` / `identifier` / `description` / `version` / `available` / `hidden` / `type` / `url` / `portable` / `category` / `runtime` / `requireRoles` / `requirePermissions`.
- `entities/<id>.json`: Schema record (`name` / `category` / `identifier` / `description` / `version` / `tree` / `extra`) plus an embedded `fields` array. The platform stores fields as separate Field records, so saving splits the file into Schema + field writes (see the mapping table).
- `funcs/<entity>/<func>.js`: Func body in plain JS; only sandbox-internal vocabulary is allowed. `<func>.meta.json` records `identifier` / `name` / `type` (static / object / constructor) / `comment`.
- `pages/<id>.json`: Eureka page JSON with top-level `type: "page"`; component `api` uses the `[method:]url` form, and API responses must be `{ status, msg, data }` (status 0 means success).
- `menus.json`: array of menu records (`name` / `group` / `path` / `icon` / `sort` / `hidden` / `requireRoles` / `requirePermissions`); each entry may carry a `page` field declaring the mounted page identifier.
- `data/<id>.json`: fixture record array; used by the local sandbox and manual verification only, never written to the platform by API save.

## Sandbox vocabulary (Func body whitelist)

Internal vocabulary: `getColl` / `ObjectId` / `dayjs` / `crypto` / `Buffer` / `Decimal` / `console` / `__env` / `__funcExecutor` / `reportError` / `reportService`, plus the request-injected `body` / `query` / `session`.

External-dependency vocabulary (`axios` / `ai` / `requireAdapter` and so on): not injected, supported, or mocked by the sandbox; functions using these words are marked "manual handling required".

## Platform API mapping (creation order)

| Product | Create API | Request body essentials |
| --- | --- | --- |
| App | `POST /app-package` | app.json fields |
| Entity | `POST /app-package/entity` | Schema fields + `app` (App ObjectId) |
| Field | `POST /app-package/entity/field` | `entity` (Schema ObjectId) + name/label/type/unique/editable/comment |
| Function | `POST /app-package/entity/func` | `entity` (Schema ObjectId) + identifier/name/comment/body/type |
| Menu | `POST /app-package/menu` | `app` + name/group/path/icon/sort/hidden/requireRoles/requirePermissions |
| Page | `POST /app-package/menu/:id/page` | the page JSON itself as the request body |
| Data | `POST /app-package/entity/:identifier` | record fields |

Updates use `PATCH` (App `/app-package/:id`, Entity `/app-package/entity/:id`, Field `/app-package/entity/field/:id`, Function `/app-package/entity/func/:id`, Menu `/app-package/menu/:id`, Page `/app-package/menu/:id/page`).

Query and execution: `GET /app-package/entity/:identifier/page|list`, `POST /app-package/entity/:identifier/func/:funcIdentifier` (static), `POST /app-package/entity/:identifier/:id/func/:funcIdentifier` (object).

## Corrections to the design documents

The following differences were verified against the uicp-server source (2026-08-16) and correct the statements in UPGRADE.md / IMPLEMENTATION.md; they will be written back into the design documents after M1 manual-import verification passes:

1. The App domain object has no `trade` field (industry is `category`); the design document field table contains `trade`, which is removed from this contract.
2. `Schema.tree` is a boolean (data-tree mode switch), not the field structure; fields are separate Field records (`POST /app-package/entity/field`). The directory projects them as an embedded `fields` array in `entities/<id>.json`, split into Schema + field writes on save.
3. The Func sandbox injection is named `__funcExecutor` (the design document writes `executeFunc`, which is only an internal variable in `buildContext`).
4. The Func create API takes the schema id in the `entity` request-body field (not stated in the design document).
5. Menu records are flat (`group` / `name` / `path` / `icon` / `sort`); the "menu tree" is organized by group/path, and Page mounts via the `menu` field.
6. The Page create API request body is the page JSON itself (not a `{ schema: ... }` wrapper).
7. `GET /app-package/menu/:id/page` returns the parsed page JSON, not a Page record wrapper.
8. Live platform page JSONs may carry `/lowcode/form/schema/...` data URLs, but that prefix is a platform-frontend gateway rewrite and returns 404 on the direct API; this contract pins the directly working `/app-package/entity/...` paths (verified 200).

## Manual import verification (M1 acceptance)

```sh
BASE_URL=<平台服务地址> JWT=<平台Token> TENANT_ID=<租户ObjectId> app-packages/import-example.sh
```

The script creates the example app package in "App → Entity → fields → functions → menu → page → fixture data" order and prints verification commands at the end. The platform-side manual happy-path fallback: open the order list page, query/create/delete, execute the order summary and mark-complete functions.

The script is idempotent: it reuses existing records by identifier/path and only creates missing items; fixture data is written only when the entity has no records. To rebuild from scratch, delete the whole App first (`DELETE /app-package/:id` cascades to every product under it).
