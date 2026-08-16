# @deepseek-ai/dsh-client-ui-uicp-nav

English | [中文](README.zh.md)

UICP platform navigation plugin for the desktop driver: JWT sign-in, tenant → app-package → session browsing in the sidebar, and a session switch in the conversation header.

## Registration

- Replaces `sidebar.workspaces` with the tenant/app-package/session browser (single slot; the upstream ui-workspace occupant is excluded by composition).
- Adds a `conversation.session.header.actions` entry (`id: uicp.session.switch`) rendering a session selector.

## Token storage

The platform token is stored through the shell `get_token` / `set_token` / `clear_token` commands (keychain in a later milestone), with an in-memory fallback when the Tauri bridge is absent. The token never lands in localStorage/sessionStorage.

## Session creation

Session creation goes through the workspace registry: `ctx.workspaces.create({ path })` registers the app-package directory idempotently, then `ctx.workspaces.startSession(workspaceId)` opens a session whose cwd is that directory. The app-packages root comes from the shell `app_packages_root` command.

## Model Experience

None, as the plugin is browser chrome; nothing here reaches a model request.
