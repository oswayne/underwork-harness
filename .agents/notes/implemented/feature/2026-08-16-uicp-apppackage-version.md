# Agent Note: UICP app-package local versions

Status: implemented

English | [中文](2026-08-16-uicp-apppackage-version.zh.md)

## Problem

M3 requires local version snapshots so drafts can be reviewed, switched, and rolled back before adoption, without touching platform history. Without a tool, rollback meant manual file copies.

## Decision

[`@deepseek-ai/dsh-tool-apppackage-version`](../../../../packages/uicp/tool-apppackage-version/README.md) registers `apppackage_version` with `snapshot` / `list` / `restore` actions over `ctx.fs`. Snapshots copy product files (app.json / tenant.json / menus.json / entities / funcs / pages / data fixtures) into `versions/<name>/`, excluding `tests/`, `versions/`, and session data under `data/<session>/`.

## Alternatives considered

- **Wrapping git for drafts** — rejected: the app-package directory may live outside this repository, and the plan keeps version snapshots separate from git commit history.

## Consequences

Restores are followed by re-validation and re-testing per the tool guidance. Retention caps and diff views are deferred because `ctx.fs` has no delete API.
