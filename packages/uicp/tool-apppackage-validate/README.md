# @deepseek-ai/dsh-tool-apppackage-validate

English | [中文](README.zh.md)

Model-facing static validation for UICP app-package directories. The tool reads one app-package directory (contract in [app-packages/README.md](../../../app-packages/README.md)) through `ctx.fs`, so sandbox policy applies, and returns structured issues plus derived cross-app dependencies.

## Tool

`apppackage_validate(directory)` validates:

- package records: `app.json` / `tenant.json` parse as JSON objects and match the directory names (`package.identifier`, `package.tenant`, `package.name`).
- entities: lowercase kebab-case identifier matching the file name, no duplicate identifiers, `fields` array with non-empty `name`/`label`, `type` from the platform enum, boolean `unique`/`editable`.
- functions: `.js` body paired with a `.meta.json` sidecar, meta identifier matching the file name, `type` from `static` / `object` / `constructor`, body compiles as `vm.Script`; bodies using external vocabulary (`axios` / `ai` / `requireAdapter`) are flagged as "manual handling required" warnings.
- pages: top-level `type: "page"` and full validation against the vendored Eureka `schema.json` (data/).
- menus: array structure, non-empty names, and page mounts that resolve.
- fixture data: records are objects whose keys are entity fields, with number/boolean/string checks against the entity field types.
- cross-app dependencies: `getColl` / `__funcExecutor` calls in Func bodies and `/app-package/entity/:identifier/...` URLs in page JSON, excluding the package's own identifiers.

The canonical value is `{ ok, issues: [{ severity, file, rule, message }], dependencies: [{ identifier, kind, references }] }`; errors block publication, warnings require review.

## Model Experience

The tool description tells the model to run validation after generating or editing an app package, before adoption or publish. The terminal render lists every finding as `[severity] file (rule) message` and every cross-app reference as `identifier (kind): references`.

## Known Limitations and Deferred Work

- The identifier whitelist check is limited to external-vocabulary detection; full sandbox-vocabulary enforcement lives in the M3 sandbox (`vm` context injection).
- Dependency extraction is regex-based; dynamically concatenated identifiers are reported by the model for manual confirmation before publish.
- `data/eureka-schema.json` is a vendored snapshot of the Eureka `schema.json` build product; the M4 sync script keeps it current.
