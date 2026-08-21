# @deepseek-ai/dsh-client-ui-apppackage-workspace

English | [中文](README.zh.md)

App-package product workspace for the UICP low-code driver. The client plugin replaces the upstream details seat (single-slot shadowing via negative priority) with a tabbed workspace: rendered preview, eureka visual editor (opened in a dedicated browser window), raw JSON editing, automated tests, and local version management.

## Tabs

- **预览** — renders the current page JSON through the self-contained eureka preview bundle with session fixture data.
- **编辑** — opens the standalone eureka editor window (`/uicp/editor`) for visual page editing with write-back and re-validation.
- **JSON** — text-level page editing with save and validation feedback.
- **测试** — runs the generated app-package test suite against the local sandbox.
- **版本** — snapshot, list, and restore local versions.

## Model Experience

None, as the plugin is browser chrome; nothing here reaches a model request.

#### KV Cache effect

None; the plugin neither assembles nor sends a provider request.
