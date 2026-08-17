# Agent Note: UICP sidebar navigation

Status: implemented

English | [中文](2026-08-17-uicp-sidebar-navigation.zh.md)

## Problem

The dsh desktop driver needs a platform-facing navigation surface: sign in with a uicp JWT, then browse the operator's tenants, an app package's entities/pages, and the sessions running in that app package's workspace directory. The stock sidebar browser only browses host workspaces and sessions, and the platform API rejects direct browser calls via CORS (see the [same-origin API proxy note](../architecture/2026-08-17-uicp-api-proxy.md)).

## Decision

[`@deepseek-ai/dsh-client-ui-uicp-nav`](../../../../packages/client/ui-uicp-nav/README.md) registers the `sidebar.workspaces` occupant and a `conversation.session.header.actions` session-switch entry. The JWT lives in the shell through the `get_token` / `set_token` / `clear_token` commands (capability-gated in the Tauri shell), with an in-memory fallback when the bridge is absent; the token never touches localStorage. Tenant → app-package → session browsing renders from `/uicp-api` platform calls, and session creation registers the app-package directory as a workspace and starts a session there.

The UI reuses the dsh sidebar design language: `Button` / `Input` primitives, the `--dsw-alias-*` token families, 32px/8px-radius rows with `--dsw-alias-interactive-bg-hover` chrome, and the shell's inline-padding variables. The web-app patch disables `ui-workspace` so the slot has a single occupant.

## Alternatives considered

- **Reusing ui-workspace and layering platform data on top** — rejected: its session model is host workspaces, not platform app packages; the divergence would grow with every platform-specific surface.
- **iframe embedding of uicp-web-admin** — rejected by requirement: the sidebar stays the navigation surface, and the driver keeps its own session model.

## Consequences

Sign-in works in both the Tauri shell (keychain-backed commands) and a plain browser (in-memory token), which is also the headless test path. Platform calls go through the same-origin proxy, so the browser never hits CORS. The nav plugin is browser chrome only: nothing reaches a model request.
