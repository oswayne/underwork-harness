# Agent Note: Reuse the nav token store instead of duplicated localStorage keys

Status: proposed

English | [中文](2026-08-23-reuse-nav-token-store.zh.md)

## Problem

The platform token's localStorage key `uicp.platform.token` is hardcoded in three places: `packages/client/ui-uicp-nav/src/client/token.ts` (the owner), `packages/client/ui-apppackage-workspace/src/client/sandbox-fetcher.ts` (its `previewHeaders` helper), and the editor-window inline script in `packages/uicp/preview-backend/src/index.ts`. A key rename in the owner would silently break the other two readers.

## Proposal

Re-export `getToken` from `@deepseek-ai/dsh-client-ui-uicp-nav/client` and have `ui-apppackage-workspace` import it (the package dependency was deferred earlier only because the environment could not regenerate the lockfile; `pnpm install` on a network-capable machine is now an accepted step). The editor window cannot import client modules, so it keeps reading localStorage but through the shared key constant shipped by the nav package's public export if feasible, else a documented comment.

## Alternatives considered

The earlier rejection was environment-specific (a lockfile re-resolution failed against the private registry), not a design decision; the shared token store is the correct single owner and the workspace package already reads the same key for publishing.

## Acceptance criteria

- `sandbox-fetcher.ts` uses `getToken()` from the nav client export; the local `TOKEN_KEY` constant is deleted.
- Tests assert the Authorization header through the store, and `pnpm run hygiene` (client-package dependency rules) passes with the new declared dependency.

## Risks

The cross-package import couples two fork client packages; both are part of the same UICP surface and the dependency is declared per `verify-client-packages`. The editor window remains a browser-only special case.
