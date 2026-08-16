# @deepseek-ai/dsh-contract-matrix

English | [中文](README.zh.md)

Behavior-matrix contract corpus and dual-target runner for the uicp data sandbox. The fixed corpus covers every query operator, CRUD, stats, tree, constructor, and function error semantics; the runner executes it against any request/response target and can diff two targets (sandbox vs platform) for the M4 fidelity gate.

## Corpus

`buildMatrix()` returns the canonical cases against the `matrix` entity:

- every operator (`like` / `notLike` / `isNull` / `isNotNull` / `isBlank` / `isNotBlank` / `in` / `notIn` / `eq` / `ne` / `gt` / `ge` / `gte` / `lt` / `le` / `lte` / `between` / `notBetween`), unknown-operator fallback, empty-value skipping;
- sort directions, pagination bounds, `_preventListAll`, stats count/sum, date and boolean conversions;
- CRUD with unique and constructor lifecycle semantics, static/object function paths, tree queries and branches.

## Targets

- `buildReferenceTarget()` constructs a fresh in-process sandbox with deterministic seed ids (`seed-1..3`, `tree-1..2`) as the local reference.
- `runMatrix(target, cases)` reports per-case pass/fail; `diffMatrix(left, right, cases)` reports divergences for the sandbox-vs-platform comparison once a platform benchmark endpoint is wired.

## Known Limitations and Deferred Work

- The platform-side target adapter is pending the benchmark environment; the diff runner is ready and unit-tested against fake targets.
