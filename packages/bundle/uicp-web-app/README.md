# `@deepseek-ai/dsh-uicp-web-app`

English | [中文](README.zh.md)

The UICP web-surface bundle. [`cordis.patch.yml`](cordis.patch.yml) rides over [`dsh-web-app`](../web-app/README.md): it inserts the same-origin platform API proxy (`/uicp-api/*`), the app-package preview seam, the UICP sidebar navigation, and the app-package workspace, and pins the directory-picker to the browse backend so the tenant switch can create app-package directories programmatically. All rows reference plugins owned by their own packages; this bundle only declares them and their peer providers.

## Model Experience

Indirectly, through the inserted rows: this bundle contributes no model-visible text of its own.

#### KV Cache effect

None directly; each inserted row's package owns its effect.

## Known Limitations and Deferred Work

- **Patch-only bundle** — this package carries no runtime code; every mounted row's behavior belongs to the referenced package.
