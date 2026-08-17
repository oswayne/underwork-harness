# Agent Note: UICP same-origin API proxy

Status: implemented

English | [中文](2026-08-17-uicp-api-proxy.zh.md)

## Problem

The dsh web UI is served from `http://127.0.0.1:<port>` and the uicp platform API only answers browser CORS for its known origins. After JWT login succeeded, every platform call from the page failed with `TypeError: Load failed`, so the tenant list never rendered.

## Decision

[`@deepseek-ai/dsh-uicp-api-proxy`](../../../../packages/uicp/api-proxy/README.md) registers the `/uicp-api` prefix on the dsh web server: the browser sends same-origin requests with its `Authorization` / `Tenant` / `content-type` headers, and the host forwards method, body, and those headers to the configured `upstream` (`https://api.underwork.cn/uicp`), echoing the JSON response. Upstream failures map to 502 with a JSON body.

The client `API_BASE` ([`ui-uicp-nav`](../../../../packages/client/ui-uicp-nav/README.md)) defaults to `/uicp-api` in the browser, with `window.__UICP_API_BASE__` as an override and the direct platform URL outside the browser. The plugin row is part of the web-app bundle patch, so every `dsh web` session gets the route; the upstream stays a validated `Config` field rather than a hardcoded constant.

## Alternatives considered

- **Direct cross-origin fetch from the page** — rejected: the platform denies CORS for the local origin, and the browser enforces that regardless of token validity.
- **iframe embedding of uicp-web-admin** — rejected by requirement: the navigation surface stays a separate dsh sidebar, not an embedded admin page.
- **Native HTTP client in the desktop shell** — rejected: it duplicates request plumbing and moves the token into the shell process; the page already owns the token.

## Consequences

Platform calls are same-origin, so the CORS denial no longer blocks the UI; the proxy is a plain forwarding seam with no caching, auth, or shape rewriting. New platform endpoints need no client change beyond their existing `API_BASE` path. Coverage pins the route contract: header forwarding, POST bodies, HEAD/no-method handling, Buffer/Uint8Array chunks, upstream failure mapping, and the empty-upstream rejection.
