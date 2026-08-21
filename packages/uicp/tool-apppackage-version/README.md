# @deepseek-ai/dsh-tool-apppackage-version

English | [中文](README.zh.md)

Model-facing local version management for UICP app packages. The tool snapshots product files (app.json / tenant.json / menus.json / entities / funcs / pages / data fixtures) into `versions/<name>/`, lists snapshots, and restores one over the working directory.

## Tool

`apppackage_version(directory, action, version?)`:

- `snapshot` copies product files into `versions/` (name defaults to a timestamp); excludes `tests/`, `versions/`, and sandbox session data under `data/<session>/`.
- `list` reports snapshots newest first.
- `restore` copies one version's files back over the working directory and returns the file count.

The canonical value is `{ ok, action, version?, versions?, restored? }`. Snapshots are local-only: platform `PageVersion` history is never touched.

## Model Experience

### apppackage_version

#### What the model sees

The tool description directs the model to snapshot before platform sync or an adopted publish, and to re-validate after a restore (`apppackage_validate`) and re-run tests (`apppackage_test`); the terminal render reports the action outcome.

#### Token effect

The tool adds one tool-call entry per invocation; no request prefix is added beyond the tool's own description and result.

#### KV Cache effect

No main-request invalidation; the tool call does not change the conversation's prompt prefix.

## Known Limitations and Deferred Work

- Retention caps and diff views are deferred: `ctx.fs` has no delete API yet, so snapshots accumulate until M4 adds pruning.
