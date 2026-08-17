# @deepseek-ai/dsh-client-ui-uicp-nav

English | [中文](README.zh.md)

UICP platform navigation plugin for the desktop driver: a dedicated full-window JWT sign-in gate, tenant → app-package → session browsing in the sidebar once signed in, and a session switch in the conversation header.

## Registration

- Gates the whole frame behind a `shell.overlay` entry (`id: uicp.login`): a stored token is validated against `/user/user/self` on entry, and the app opens only when it still identifies a user; an invalid token is cleared for re-entry. Logout returns to it.
- Replaces `sidebar.workspaces` with the tenant/app-package/session browser (single slot; the upstream ui-workspace occupant is excluded by composition).
- Adds a `conversation.session.header.actions` entry (`id: uicp.session.switch`) rendering a session selector.

## Token storage

The platform token lives in the webview's localStorage (the app's local store, SharedPreferences-style) and is mirrored through the shell `get_token` / `set_token` / `clear_token` commands to a file in the app data directory. The mirror survives the sidecar's per-launch port change, which would otherwise orphan the origin-scoped localStorage; in-memory fallback keeps the web UI usable in a plain browser. Sign-in state is shared through the `subscribeAuth` / `authSnapshot` store so the login gate and the sidebar browser react together.

## Session creation

Session creation goes through the workspace registry: `ctx.workspaces.create({ path })` registers the app-package directory idempotently, then `ctx.workspaces.startSession(workspaceId)` opens a session whose cwd is that directory. The app-packages root comes from the shell `app_packages_root` command.

## Model Experience

None, as the plugin is browser chrome; nothing here reaches a model request.
