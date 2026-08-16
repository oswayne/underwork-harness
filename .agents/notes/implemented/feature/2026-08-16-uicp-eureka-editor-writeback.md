# Agent Note: UICP eureka editor write-back

Status: implemented

English | [中文](2026-08-16-uicp-eureka-editor-writeback.zh.md)

## Problem

M3 requires local intervention through eureka-editor: edits must write back to the app-package directory (the single source of truth) and re-pass validation. The desktop UI does not exist yet, so the write-back path must be a testable seam rather than UI glue.

## Decision

[`@deepseek-ai/dsh-eureka-preview-host`](../../../../packages/uicp/eureka-preview-host/README.md) gains `mountEurekaEditor` (mirrors the platform's `uicp-web-editor` integration: `<Editor value onChange preview isMobile />`) and `savePageSchema(fs, directory, pageIdentifier, schema)`. Pure edit state (`createEditorHandle`) and the write-back are unit-covered; the render adapter is excluded from per-file coverage (client-lane debt, `vitest.config.ts`) until a browser-grade harness exists. `eureka-editor` / `eureka-editor-core` 8.14.6 join the bundle's React 19 dependency set.

## Alternatives considered

- **Persisting edits through a sandbox HTTP route** — rejected: page files are workspace artifacts owned by `ctx.fs`; a filesystem seam keeps sandbox policy and one write path.

## Consequences

The host UI's save action becomes `savePageSchema` + re-run `apppackage_validate`; editor rendering remains deferred to the desktop UI assembly (M0 shell). The bundle size is unchanged because eureka-editor reuses the already-bundled eureka-ui internals.
