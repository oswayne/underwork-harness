# Agent Note: UICP contract matrix

Status: implemented

English | [中文](2026-08-16-uicp-contract-matrix.zh.md)

## Problem

The M4 fidelity gate requires the same corpus to run against the local sandbox and the real platform benchmark, with divergences reported. The existing tool tests cover behavior per package, but there was no pinned corpus shared by both targets.

## Decision

[`@deepseek-ai/dsh-contract-matrix`](../../../../packages/uicp/contract-matrix/README.md) ships a fixed corpus (all 18 operators, fallback/skip semantics, sort, pagination, `_preventListAll`, stats, date/boolean conversions, CRUD with unique and constructor lifecycle, static/object function paths, tree queries and branches) plus `runMatrix` / `diffMatrix`. `buildReferenceTarget()` seeds a deterministic in-process sandbox (fixed `_id`s) as the local reference; the platform adapter is wired when the benchmark environment exists.

## Alternatives considered

- **Deriving the matrix from app-package fixtures** — rejected: the gate needs a fixed, package-independent contract corpus, not one that shifts with each example package.

## Consequences

The corpus already pins sandbox behavior (78 uicp tests, 100% coverage) and the diff runner is ready for the platform endpoint; sandbox insert now parses field values by type (mirroring `Field.parse`), which the matrix's date/boolean cases required.

The first live-platform run (2026-08-16, dsh-test) scored 37/45 consistent; the remaining divergences are platform-side defects: `eq`/`ne` and `in`/`notIn`/`between`/`notBetween` skip numeric type conversion (string-vs-number comparisons), and `ge`/`le` emit invalid Mongo operators (`$ge`/`$le`, HTTP 500). These are recorded for the platform maintainers; the sandbox stays contract-faithful.
