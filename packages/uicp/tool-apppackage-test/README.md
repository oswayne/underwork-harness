# @deepseek-ai/dsh-tool-apppackage-test

English | [中文](README.zh.md)

Model-facing automated test runner for UICP app packages. The tool builds an in-process sandbox (data + query + Func execution) from the app-package directory, seeds fixture data, generates positive/negative/boundary cases from the contract, runs them, and reports a structured pass/fail/skip result.

## Tool

`apppackage_test(directory)`:

- generates cases per entity: insert (with a non-conflicting unique value), duplicate-unique rejection, list, paged query, `_preventListAll` rejection, numeric `gt` filter, tree query for tree entities;
- generates cases per function: static calls, object calls with a missing record (404), constructor-triggered inserts; bodies using external vocabulary (`axios` / `ai` / `requireAdapter`) are skipped as "manual handling required";
- runs every case against the local sandbox and asserts the `{ status, msg, data }` envelope;
- persists the generated cases to `tests/apppackage.cases.json` for review and extension.

The canonical value is `{ ok, cases, passed, failed, results: [{ name, passed, skipped?, message }] }`; `ok` is false when any case fails, feeding the model's fix loop.

## Model Experience

The tool description directs the model to run tests after `apppackage_validate` and before adoption. The terminal render lists one `PASS` / `FAIL` / `SKIP` line per case with the failing assertion.

## Known Limitations and Deferred Work

- Cases are template + parameterized generation; domain-specific scenarios are added by editing `tests/apppackage.cases.json`.
- The behavior-matrix contract suite against a real platform benchmark is the M4 fidelity gate; this tool runs the keyless local mirror.
