# @deepseek-ai/dsh-eureka-preview-host

English | [中文](README.zh.md)

Self-contained Eureka page preview for the UICP low-code driver. The bundle carries its own React 19 + eureka runtime (eureka 8.14.6 requires React 19 while the dsh Web UI stays on React 18), so the preview mounts into any DOM node without an iframe: the hosting app dynamically loads the built bundle and calls `mountEurekaPreview(container, schema, env)`.

## API

- `mountEurekaPreview(container, schema, env)` renders the page JSON (top-level `type: "page"`) into `container` with the caller's `fetcher` and returns `{ unmount() }`.
- `env.fetcher` must return platform-shaped responses `{ status, msg, data }`; the UICP sandbox host supplies it in the assembled app.
- Optional `env.theme` (default `cxd`), `env.locale` (default `zh-CN`), `env.isCancel`, `env.copy`.

## Build

`pnpm run build:preview` emits `dist/uicp-eureka-preview.js` (IIFE, `UicpEurekaPreview`) plus its CSS assets. The React 19 runtime is bundled inside; nothing is shared with the hosting app's React 18.

## Known Limitations and Deferred Work

- The preview renders with the caller's fetcher; the sandbox data path (`/app-package/entity/...`) is wired in M3.
- Writes from the eureka editor are M3 scope; this package only renders.
- The bundle is large (~13 MB, monaco + eureka-ui internals) by design; it is a lazy-loaded chunk, and the editor's `json` language import is not part of this preview build.
