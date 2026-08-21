# Agent Note：UICP 同源 API 代理

Status: implemented

[English](2026-08-17-uicp-api-proxy.md) | 中文

## 问题

dsh Web UI 运行在 `http://127.0.0.1:<port>`，而 uicp 平台 API 只对已知来源响应浏览器 CORS。JWT 登录成功后，页面上的所有平台调用都以 `TypeError: Load failed` 失败，租户列表始终无法渲染。

## 决策

[`@deepseek-ai/dsh-uicp-api-proxy`](../../../../packages/uicp/api-proxy/README.zh.md) 在 dsh web 服务器上注册 `/uicp-api` 前缀：浏览器以同源请求携带 `Authorization` / `Tenant` / `content-type` 头，宿主端把方法、请求体与这些头转发到配置的 `upstream`（`https://api.underwork.cn/uicp`），并原样回传 JSON 响应；上游失败映射为 502 JSON。

客户端 `API_BASE`（[`ui-uicp-nav`](../../../../packages/client/ui-uicp-nav/README.zh.md)）在浏览器中默认取 `/uicp-api`，支持 `window.__UICP_API_BASE__` 覆盖，非浏览器环境回退到平台直连地址。该插件行挂在 web-app bundle patch 中，因此每次 `dsh web` 会话都带有此路由；upstream 是可校验的 `Config` 字段而非硬编码常量。

## 备选方案

- **页面直接跨源 fetch** —— 拒绝：平台对本地来源拒绝 CORS，浏览器无论 token 是否有效都会拦截。
- **iframe 嵌入 uicp-web-admin** —— 按需求拒绝：导航面保持独立的 dsh 侧边栏，而不是内嵌管理页。
- **桌面壳原生 HTTP 客户端** —— 拒绝：它重复了请求链路，并把 token 移入壳进程；token 本就归页面所有。

## 后果

平台调用变为同源请求，CORS 拒绝不再阻塞 UI；代理是纯转发接缝，不缓存、不鉴权、不改写数据结构。新增平台端点无需改动客户端，只需沿用现有 `API_BASE` 路径。覆盖率钉住了路由契约：头转发、POST 请求体、HEAD/无 method、Buffer/Uint8Array 分块、上游失败映射，以及空 upstream 拒绝。
