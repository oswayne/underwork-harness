# @deepseek-ai/dsh-uicp-preview-backend

English | [中文](README.zh.md)

App-package preview seam for the UICP low-code driver. The host plugin serves the self-contained eureka preview/editor bundle and the app-package data routes the browser UI consumes: page/fixture reads, editor write-back with re-validation, the workspace test runner, local version snapshots/restore, and the adoption-gated publish upsert. It also answers `GET /uicp/preview/root` with the app-packages root resolved from its config or the process cwd, so the browser never needs a shell-provided path.

## Routes

- `GET /uicp/editor` — standalone eureka editor window page.
- `GET /uicp/preview/root` — resolved app-packages root.
- `GET|POST /uicp/preview/page` — page schema/fixture reads and editor write-back.
- `POST /uicp/preview/test` — run the app-package test suite.
- `POST /uicp/preview/version` — snapshot, list, or restore local versions.
- `POST /uicp/preview/publish` — adoption-gated upsert to the platform.
- `GET /uicp/preview/entity/...` — sandbox data queries for page preview.

## Model Experience

None, as the preview seam serves browser/editor assets and sandbox data routes; the model reaches it only through the tool packages.

#### KV Cache effect

None; the seam neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- The standalone editor opens as a browser popup; popup blockers surface an error in the editor seat.
