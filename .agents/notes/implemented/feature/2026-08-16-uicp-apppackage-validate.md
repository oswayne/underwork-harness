# Agent Note: UICP app-package validation tool

Status: implemented

English | [中文](2026-08-16-uicp-apppackage-validate.zh.md)

## Problem

M2 makes the agent generate app packages against the frozen directory contract, but without a validation loop the model cannot verify its own output: contract violations would surface only at platform import time. The generation driver needs a static gate that reports structured issues and cross-app dependencies back to the model for correction.

## Decision

A new `uicp/` package group ships [`@deepseek-ai/dsh-tool-apppackage-validate`](../../../../packages/uicp/tool-apppackage-validate/README.md): the `apppackage_validate` tool reads one app-package directory through `ctx.fs` (sandbox policy applies) and runs the static validation matrix from the [app-package contract](../../../../app-packages/README.md) — package records, entity identifiers and fields, func meta pairing plus `vm.Script` compilation and external-vocabulary detection, Eureka `schema.json` page validation, menu mounts, fixture field/type checks, and regex-based cross-app dependency extraction (`getColl` / `__funcExecutor` / page entity URLs). The canonical value is `{ ok, issues, dependencies }`; errors block publication, warnings need review.

The [uicp agent preset](../../../../apps/cli/config/agent-presets/uicp/agent.cordis.yml) copies `standard` and adds the tool row plus an AppPackage-delivery persona; the [uicp-contract skill](../../../../.agents/skills/uicp-contract/SKILL.md) carries the lookup summary. The group registers in `packages/README.md` and `tsconfig.host.json`; the Eureka schema is a vendored `data/eureka-schema.json` snapshot loaded at runtime.

The eureka preview ships as [`@deepseek-ai/dsh-eureka-preview-host`](../../../../packages/uicp/eureka-preview-host/README.md): a self-contained React 19 IIFE bundle (eureka 8.14.6 requires React 19, verified 2026-08-16, while the dsh Web UI stays on React 18) that the hosting app loads and mounts into the page DOM without an iframe. The editor write-back stays in M3.

M2 scope is deliberately partial: the identifier whitelist check is external-vocabulary detection only (full sandbox-vocabulary enforcement lives in the M3 sandbox `vm` context), and dependency extraction is regex-based (dynamically concatenated identifiers are reported for manual confirmation).

## Alternatives considered

- **One validation tool per artifact type** — rejected: a single `apppackage_validate` keeps the generate → validate → fix loop one call and one report, and the per-artifact checks are separable functions inside it.
- **Reading files with `node:fs` directly** — rejected: `ctx.fs` keeps the sandbox policy and workspace roots that the agent already trusts for file tools.
- **Importing `schema.json` as a JSON module or TypeScript file** — rejected: no repo package imports JSON today; a runtime data file keeps source-mode and built-mode paths identical (`../data/` from both `src/` and `lib/`).
- **Depending on the eureka private registry for the schema** — rejected: the registry is unreachable from this environment; a vendored snapshot with the M4 sync script preserves the "contract as data dependency" direction.

## Consequences

The model can validate an app package before the user adopts it, and the structured canonical output feeds the correction loop. The new packages hold per-file 100% coverage, the preset and skill are discoverable without upstream edits, and the plan's shared-file list gains `tsconfig.host.json` (project references), `packages/README.md` (group row), and `vitest.config.ts` (eureka inline deps + monaco alias). The vendored schema must be re-synced with Eureka releases (M4 script), and the eureka editor write-back is deferred to M3.
