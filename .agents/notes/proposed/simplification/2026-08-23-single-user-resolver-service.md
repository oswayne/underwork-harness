# Agent Note: Share one user resolver instead of per-plugin instances

Status: proposed

English | [中文](2026-08-23-single-user-resolver-service.zh.md)

## Problem

`createUserResolver` in `packages/uicp/user-identity` is instantiated by two plugins in the same process: `uicp-user-identity`'s own route and `uicp-project-git` (which calls `createUserResolver(config)` in its `apply`). Each instance owns a separate credential cache and a separate `UserStore`, and both append to the same `$DSH_HOME/uicp-users/users.jsonl` ledger. The platform self endpoint is therefore hit up to twice for the same token, and two stores race appends to one file.

## Proposal

`uicp-user-identity` provides a shared resolver as a cordis service (e.g. `ctx.uicpUser.resolve(token)`), and `uicp-project-git` injects `uicpUser` instead of building its own resolver. The service owns one cache, one `UserStore`, and one JSONL writer.

## Alternatives considered

The double instance is currently harmless (last-write-wins appends; cache misses just cost one extra platform call per token per plugin). But the duplication grows with each future consumer (the M5 ownership seam, P2 display) and the two caches make the "cache per credential" guarantee ambiguous.

## Acceptance criteria

- Only `uicp-user-identity` constructs the resolver; `uicp-project-git` consumes it via inject.
- The same token answered by both plugins in one process triggers exactly one platform self call and one ledger append.
- Existing route tests and 100% coverage stay green.

## Risks

Introducing a service adds a cordis dependency edge between fork packages; the alternative is accepting per-plugin caches forever. The service surface is one method and does not widen upstream contact.
