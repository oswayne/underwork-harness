# Agent Note: Web 应用的 URL jwt 移交

Status: implemented

[English](2026-08-22-url-jwt-handoff.md) | 中文

## 问题

Web 应用需要平台 JWT 才能列出租户或打开工作区，Token 保存在浏览器 localStorage（`uicp.platform.token`）。其他页面需要一种方式携带新凭据跳转进入应用，而不是要求用户把 JWT 粘贴进登录表单。

## 决定

应用接受页面 URL 上的 `jwt` 查询参数作为 Token 移交。有效 Token 的解析顺序为：URL `jwt` 优先，其次本地保存的 Token，最后内存值（`packages/client/ui-uicp-nav/src/client/token.ts` 的 `getToken`）。在 `refreshAuth` 中：

- 有效的 URL Token 在参数从 URL 移除前写入 localStorage，因此不带移交 URL 的刷新仍保持登录。
- 无效的 URL Token 会清空本地 Token 与参数，登录表单可接管，过期的参数不会把用户弹回。

`jwt` 参数在消费后通过 `history.replaceState` 从 URL 移除，凭据不会滞留在地址栏与历史记录中。

## 备选方案

- **仅在本会话优先使用 URL Token 而不持久化**——已拒绝：不带移交参数的刷新会回退到旧 Token，将用户登出预期凭据。
- **消费后保留 URL 中的 `jwt` 参数**——已拒绝：凭据会滞留在地址栏与历史记录中；参数是移交手段，不是持久状态。

## 后果

跨页面跳转可携带 `?jwt=<token>` 直接登录；优先级为 URL jwt、本地 Token、内存 Token。由于 `refreshAuth` 共享进行中的校验，同一有效 Token 只对 `/user/user/self` 校验一次。参数清理仅在浏览器中执行，无 `window` 的无头与测试运行不受影响。
