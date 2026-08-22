# Agent Note: Multi-user preview seam isolation

Status: implemented

English | [中文](2026-08-22-multi-user-preview-isolation.zh.md)

## Problem

The web app is deployed as one server instance that multiple users reach from their own computers with different platform JWTs. The preview seam (`packages/uicp/preview-backend`) was anonymous and its sandbox routers were keyed by app-package directory only, so two users working on the same package shared one in-memory sandbox store and anyone who could reach the server could read or write app-package files without a token.

## Decision

The preview seam authenticates every data route with the platform JWT and isolates per-user state:

- `page`, `savePage`, `test`, `version`, `entity`, `publish`, and `root` handlers answer 401 without a `Authorization: Bearer <JWT>` header; the static editor window and bundle assets stay public.
- The sandbox router map is keyed by `<sha256(token) prefix>/<package dir>` and the sandbox request session carries the same user key, so each credential gets its own seeded in-memory sandbox for the same app package.
- The browser sends the token on every preview call: the sandbox fetcher and the page/test/version/publish panels attach `Authorization` (read from the auth store's localStorage key), `resolvePackagesRoot` in `ui-uicp-nav` attaches it, and the editor window reads the same key and forwards it.

The user key is a hash of the token — the raw credential never enters the router map or logs. The same browser profile remains single-user because localStorage keeps one token per origin; multi-user deployment relies on separate browser environments per user.

## Alternatives considered

- **Adding a ui-apppackage-workspace → ui-uicp-nav client dependency for `getToken`** — rejected: it forced a lockfile re-resolution the environment could not complete, and the workspace package already read the same localStorage key for publishing.
- **Validating the JWT against the platform on every preview request** — rejected: the sign-in flow already validates on entry, platform API calls validate per request, and per-request validation would add a platform round trip to every sandbox call. The seam trusts a present token; public exposure should add server-side validation with a cache.

## Consequences

Two users on the same server no longer share sandbox data; each credential's CRUD edits stay in its own in-memory store. Remote deployments get a token gate on the file/publish routes. Remaining team-level sharing is intentional: app-package files on disk are shared and concurrent saves are last-write-wins, and HTTPS is required for remote JWT handoff.
