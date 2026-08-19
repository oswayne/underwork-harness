# @deepseek-ai/dsh-client-ui-uicp-nav

[English](README.md) | 中文

桌面驱动器的 UICP 平台导航插件：独立的全窗口 JWT 登录门、登录后侧栏的"租户 → 应用包 → 会话"浏览、以及会话头的会话切换。

## 注册

- 通过 `shell.overlay` 条目（`id: uicp.login`）盖住整个应用：进入时用已存 token 请求 `/user/user/self` 校验，仅当仍能识别用户时才进入应用；token 失效则清除并重新输入。登出后回到该登录页。
- 替换 `sidebar.workspaces` 为租户/应用包/会话浏览器（single 槽；上游 ui-workspace 的 occupant 由装配层排除）。
- 新增 `conversation.session.header.actions` 条目（`id: uicp.session.switch`），渲染会话选择器。

## Token 存储

平台 Token 存放在 webview 的 localStorage（应用的本地存储，类似 SharedPreferences），并经壳的 `get_token` / `set_token` / `clear_token` 命令镜像到应用数据目录文件。镜像可跨 sidecar 每次启动变化的端口存活（端口变化会让按源隔离的 localStorage 丢失）；无 Tauri 桥时以内存兜底。登录态经 `subscribeAuth` / `authSnapshot` store 共享，登录门与侧栏浏览器协同响应。

## 会话创建

会话创建走 workspace 注册表：`ctx.workspaces.create({ path })` 幂等注册应用包目录，再 `ctx.workspaces.startSession(workspaceId)` 开启 cwd 为该目录的会话。应用包根目录来自 Web 服务（`GET /uicp/preview/root`）。

## Model Experience

无。本插件为浏览器界面，不触及任何模型请求。
