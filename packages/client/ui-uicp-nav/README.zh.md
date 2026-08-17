# @deepseek-ai/dsh-client-ui-uicp-nav

[English](README.md) | 中文

桌面驱动器的 UICP 平台导航插件：独立的全窗口 JWT 登录门、登录后侧栏的"租户 → 应用包 → 会话"浏览、以及会话头的会话切换。

## 注册

- 通过 `shell.overlay` 条目（`id: uicp.login`）在无 token 时以全屏登录页盖住整个应用；登出后回到该登录页。
- 替换 `sidebar.workspaces` 为租户/应用包/会话浏览器（single 槽；上游 ui-workspace 的 occupant 由装配层排除）。
- 新增 `conversation.session.header.actions` 条目（`id: uicp.session.switch`），渲染会话选择器。

## Token 存储

平台 Token 经壳的 `get_token` / `set_token` / `clear_token` 命令存取（钥匙串在后续里程碑接入），无 Tauri 桥时以内存兜底。Token 永不进入 localStorage/sessionStorage。登录态经 `subscribeAuth` / `authSnapshot` store 共享，登录门与侧栏浏览器协同响应。

## 会话创建

会话创建走 workspace 注册表：`ctx.workspaces.create({ path })` 幂等注册应用包目录，再 `ctx.workspaces.startSession(workspaceId)` 开启 cwd 为该目录的会话。应用包根目录来自壳的 `app_packages_root` 命令。

## Model Experience

无。本插件为浏览器界面，不触及任何模型请求。
