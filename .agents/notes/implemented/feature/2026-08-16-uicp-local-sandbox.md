# Agent Note: UICP local sandbox

Status: implemented

English | [中文](2026-08-16-uicp-local-sandbox.zh.md)

## Problem

M3 needs a local execution environment where generated app packages are verified before the user adopts them: data CRUD, query operators, stats/tree, and Func execution must behave like the platform. Without it, previews would hit the real platform during development and auto-tests could not run keylessly.

## Decision

[`@deepseek-ai/dsh-sandbox-server`](../../../../packages/uicp/sandbox-server/README.md) is a host plugin serving `/app-package/entity/...` on `ctx.webServer` with the same REST paths the platform uses. The store persists per-session records through `ctx.storage`'s KV facet (`backendName`, default `json`); the query engine mirrors `DataQueryApp` / `Field` (operators, type conversion, `_sort`, `_preventListAll`, pagination, stats, tree assembly and branch prefixes); the executor runs bodies in a vm context with the internal vocabulary only and mirrors constructor lifecycle semantics; uploads return a mock. `packageDir` is a required config pointing at the app-package directory.

## Alternatives considered

- **Implementing the sandbox against the real platform during development** — rejected: it would write test data into the platform, pollute production tenants, and make keyless auto-tests impossible.
- **Reusing a Mongo-memory server** — rejected: the sandbox mirrors contract behavior, not the Mongo implementation, and keeps the dependency tree small.
- **Hardcoding the storage backend name** — rejected: the backend is deployment composition; `backendName` is validated config and load fails loud without a KV facet.

## Consequences

Auto-tests and page previews run keylessly against the local mirror; the behavior-matrix contract tests against a real platform benchmark remain the M4 fidelity gate. The sandbox is development-only and never a production path.
