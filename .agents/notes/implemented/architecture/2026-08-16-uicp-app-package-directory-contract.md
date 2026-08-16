# Agent Note: UICP app-package directory contract

Status: implemented

English | [中文](2026-08-16-uicp-app-package-directory-contract.zh.md)

## Problem

The UICP desktop-driver plan makes the local app-package directory the bridgehead and single source of truth between dsh and the user, but the design documents described the platform contract at the record level and left load-bearing details imprecise: whether Entity fields live inside the Schema record, which request bodies the create APIs take, and which names the Func sandbox injects. M1 freezes the directory contract and a concrete example package so the later tools (validate, publish, sandbox, tests) build on one verified mapping instead of rediscovering the platform contract.

## Decision

The contract lives at [app-packages/README.md](../../../../app-packages/README.md) and the example at `app-packages/cszh/dsh-test/` (test tenant `cszh`, App `dsh` / `dsh-test`, one Entity, two Functions, one list page, one menu mount, fixture data). Local records reference each other by identifier only and never carry platform ObjectIds; the save tool maps identifiers to ObjectIds at publish time. Entity files embed their fields as a `fields` array even though the platform stores fields as separate records, and each Function pairs its `.js` body with a `.meta.json` sidecar (`identifier` / `name` / `type` / `comment`). Menus are flat records with an optional `page` mount reference.

The contract records six source-verified corrections to the design documents: the App domain object has no `trade` field (industry is `category`); `Schema.tree` is a boolean data-tree switch, not the field structure; the Func sandbox injects `__funcExecutor` (not `executeFunc`); the Func create API takes the schema id as `entity`; menu records are flat; and the Page create API takes the page JSON itself as the request body.

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

A repeatable import script ([app-packages/import-example.sh](../../../../app-packages/import-example.sh)) creates the example through the platform APIs in creation order and prints verification commands; the page JSON is validated against the Eureka `schema.json` where the schema requires `additionalProperties: false`.

## Alternatives considered

- **Fields as one file per field** — rejected: the directory would scatter one review unit across many tiny files; embedding `fields` in the entity JSON keeps review in one place and the publish split is a mechanical mapping.
- **Storing platform ObjectIds in local files** — rejected: ids do not exist before publish and differ per environment; identifier references keep the directory portable, diffable, and reviewable.
- **Func metadata as a header comment in the `.js` body** — rejected: parsing comments is fragile and the body must stay a plain platform-sandbox script; a `.meta.json` sidecar is explicit and checkable.
- **Authoring a fresh minimal page instead of following the platform CRUD template** — rejected: the platform's own generated `PageTemplate.js` shape is known to satisfy the Eureka schema, so the example mirrors it and substitutes entity-specific columns, APIs, and forms.

## Consequences

M2 and M3 tools (validate, publish, sandbox, automated tests) build against this contract; the sandbox vocabulary whitelist now names `__funcExecutor`; the example package gives the manual-import verification a concrete target; and the corrections stay in the contract README until the human platform import passes, then get written back into UPGRADE.md / IMPLEMENTATION.md. `tests/` and `versions/` are reserved for M3. The contract intentionally omits the platform's `trade` field and records that the design documents had it.
