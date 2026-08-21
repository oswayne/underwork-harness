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

## First platform run (2026-08-16)

Running the corpus against the live platform (dsh-test) yields **37/45 consistent**; the 8 divergences are all platform-side behavior gaps where the sandbox follows the contract:

- `eq` / `ne` on numeric fields compare strings (`{ amount: '20' }`) against stored numbers, matching nothing.
- `in` / `notIn` / `between` / `notBetween` on numeric fields compare comma-separated strings without type conversion.
- `ge` / `le` emit the invalid Mongo operators `$ge` / `$le`, failing with HTTP 500.

These are platform-side defects to report to the platform maintainers; the sandbox stays contract-faithful and the matrix keeps flagging them until the platform converges.

## Model Experience

None, as the corpus runs outside model requests and registers nothing model-facing.

#### KV Cache effect

None; the matrix neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- The platform-side target adapter is pending the benchmark environment; the diff runner is ready and unit-tested against fake targets.
