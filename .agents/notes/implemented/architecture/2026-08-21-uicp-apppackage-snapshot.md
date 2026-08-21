# Agent Note: UICP app-package keyless snapshot

Status: implemented

English | [中文](2026-08-21-uicp-apppackage-snapshot.zh.md)

## Problem

The M4 acceptance checklist's pending item was the keyless snapshot of the assembled UICP driver surface: tool unit tests and the contract matrix covered each package, but no runnable example replayed the assembled agent loop over `apppackage_validate` / `apppackage_test` / `apppackage_version` without a model key.

## Decision

[`examples/uicp-agent`](../../../../examples/uicp-agent/README.md) owns a headless composition (agent spine + the three AppPackage tools + JSONL persistence) and a replay suite that scripts one model call per tool through `llm-replay`, runs the real tools against a copied `sre-w` demo package (plus one seeded static function so the sandbox test tool has a `funcs/` tree to load), and pins the normalized stream and persisted session log. The scenario also asserts the version snapshot materializes product files and excludes the `tests/` and `versions/` trees.

## Alternatives considered

- **Mounting the full `uicp` agent preset** — rejected: the preset pulls web/browser, plan-mode, delegation, and goal rows that a headless replay neither exercises nor wants in its golden; the preset mount machinery is covered by its own package tests.
- **Generating an app package from scratch inside the replay** — rejected: hand-authoring model-written file contents makes the golden brittle, while validating/testing/versioning the committed demo package exercises the same tool surface deterministically.

## Consequences

Replay is fully keyless and deterministic (the generated sandbox suite runs 37/37 green on the seeded demo package). The golden normalizes session ids, cwd, and timestamps, so a fresh temp workspace replays byte-identically. Goldens change only through explicit `DSH_SNAPSHOT=refresh`, so demo-package drift surfaces as a replay diff instead of silent fixture churn.
