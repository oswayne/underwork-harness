# Agent Note：UICP 侧边栏导航

Status: implemented

[English](2026-08-17-uicp-sidebar-navigation.md) | 中文

## 问题

dsh 桌面驱动需要面向平台的导航面：用 uicp JWT 登录，然后浏览操作者的租户、某个应用包下的实体/页面，以及运行在该应用包工作区目录中的会话。内置侧边栏浏览器只能浏览宿主工作区与会话，且平台 API 通过 CORS 拒绝浏览器直连（见[同源 API 代理说明](../architecture/2026-08-17-uicp-api-proxy.md)）。

## 决策

[`@deepseek-ai/dsh-client-ui-uicp-nav`](../../../../packages/client/ui-uicp-nav/README.md) 注册 `sidebar.workspaces` 占位组件与 `conversation.session.header.actions` 会话切换入口。JWT 通过 `get_token` / `set_token` / `clear_token` 命令存入壳（Tauri 壳内受 capability 门禁），无桥时回退为内存 Token，绝不落 localStorage。租户 → 应用包 → 会话浏览基于 `/uicp-api` 平台调用渲染；新建会话把应用包目录注册为工作区并在其中启动会话。

UI 复用 dsh 侧边栏设计语言：`Button` / `Input` 原语、`--dsw-alias-*` token 族、32px/8px 圆角行与 `--dsw-alias-interactive-bg-hover` 悬停态，以及壳的内边距变量。web-app patch 禁用了 `ui-workspace`，保证该插槽只有一个占用者。

## 备选方案

- **复用 ui-workspace 并在其上叠加平台数据** —— 拒绝：它的会话模型是宿主工作区，不是平台应用包；平台特有界面越多，分歧越大。
- **iframe 嵌入 uicp-web-admin** —— 按需求拒绝：侧边栏保持导航面，驱动保留自己的会话模型。

## 后果

登录在 Tauri 壳（keychain 命令）与纯浏览器（内存 Token，也是无头测试路径）中都能工作。平台调用走同源代理，浏览器不再触碰 CORS。导航插件只是浏览器外壳：没有任何内容到达模型请求。
