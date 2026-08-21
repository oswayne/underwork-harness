# @deepseek-ai/dsh-sandbox-server

English | [中文](README.zh.md)

Local uicp data sandbox for the UICP low-code driver. The host plugin serves `/app-package/entity/...` REST semantics on `ctx.webServer` — CRUD, query operators, stats/tree, and vm-based Func execution — with data persisting per session through `ctx.storage`. Eureka pages preview against these same paths, so page JSON needs no environment-specific rewriting.

## Contract fidelity

- Query assembly mirrors uicp `DataQueryApp` / `Field`: bracket-key flattening, `like` with regex escaping, the full operator set (`like` / `notLike` / `isNull` / `isNotNull` / `isBlank` / `isNotBlank` / `in` / `notIn` / `eq` / `ne` / `gt` / `ge` / `gte` / `lt` / `le` / `lte` / `between` / `notBetween`), field-type conversion, `_sort`, `_preventListAll`, and `{ items, total, page }` pagination.
- Func execution mirrors `Func.exec`: `(async () => { body })()` in a vm context with the internal vocabulary (`getColl` / `ObjectId` / `dayjs` / `crypto` / `Buffer` / `Decimal` / `console` / `__env` / `__funcExecutor` / `reportError` / `reportService`); external vocabulary is not injected. Constructor functions run before single inserts and abort with their status; `insertBatch` skips them.
- Tree mode mirrors `setTreeData` (`parent` / `path` / `level`), `findAsTree`, and branch-prefix queries.

## Config

```yaml
- id: sandbox-server
  name: '@deepseek-ai/dsh-sandbox-server'
  config:
    packageDir: app-packages/cszh/dsh-test
    session: default
    maxBodyBytes: 4194304
    backendName: json
```

`packageDir` is required. `backendName` selects the `ctx.storage` backend exposing the KV facet (default `json`); a backend without the facet fails load.

## Model Experience

None, as the local data sandbox answers HTTP data routes and registers nothing model-facing.

#### KV Cache effect

None; the sandbox neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- The behavior-matrix contract tests against a real platform benchmark are the M4 fidelity gate; this package is the local mirror.
- Upload endpoints return a mock (`mock://upload`); real uploads stay out of the sandbox.
