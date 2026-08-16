# Agent Note: UICP app-package automated tests

Status: implemented

English | [中文](2026-08-16-uicp-apppackage-test.zh.md)

## Problem

The M3 acceptance requires automated tests covering positive, negative, and boundary cases, not just the happy path, executed against the local sandbox with structured results feeding the model's fix loop. Without a tool, verification stayed manual and keyless CI could not exercise generated app packages.

## Decision

[`@deepseek-ai/dsh-tool-apppackage-test`](../../../../packages/uicp/tool-apppackage-test/README.md) registers `apppackage_test`: it builds an in-process sandbox from the app-package directory (`loadPackage` + `SandboxStore` over `MemoryKvBackend` + `SandboxExecutor` + `SandboxRouter`), seeds fixture data, generates cases from entities/functions (CRUD, duplicate-unique, pagination, `_preventListAll`, numeric filters, tree, static/object/constructor functions, external-vocabulary skips), runs the suite, and persists cases to `tests/apppackage.cases.json` via `ctx.fs`. The canonical value is `{ ok, cases, passed, failed, results }`.

The sandbox package now exports `MemoryKvBackend` and the sandbox classes for reuse, and `tsconfig.base.json` gained explicit path entries for `@deepseek-ai/dsh-sandbox-server` (the wildcard entry predates the `uicp/` group's nesting and did not map the new package).

## Alternatives considered

- **Driving the sandbox over real HTTP** — rejected: in-process router calls exercise the identical REST semantics without port plumbing, keeping the tool keyless and hermetic.
- **Hand-rolling a fixture backend in the tool package** — rejected: `MemoryKvBackend` belongs to the sandbox and is reused by tests and tools.

## Consequences

Generated packages get automated verification before adoption, and the persisted `tests/apppackage.cases.json` is reviewable and extensible. The real-platform behavior-matrix suite remains the M4 fidelity gate.
