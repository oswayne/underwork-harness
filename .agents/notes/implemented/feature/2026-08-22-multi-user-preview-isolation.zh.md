# Agent Note: 多用户预览 seam 隔离

Status: implemented

[English](2026-08-22-multi-user-preview-isolation.md) | 中文

## 问题

Web 应用以单实例服务端部署，多个用户携带各自不同的平台 JWT 从各自的电脑访问。预览 seam（`packages/uicp/preview-backend`）此前匿名开放，且沙盒路由器只按应用包目录建键：两个用户操作同一应用包会共享同一份内存沙盒数据；任何能触达服务器的人无需 Token 即可读写应用包文件。

## 决定

预览 seam 的所有数据路由以平台 JWT 鉴权，并按用户隔离状态：

- `page`、`savePage`、`test`、`version`、`entity`、`publish`、`root` 处理器在缺少 `Authorization: Bearer <JWT>` 时返回 401；静态编辑器窗口与 bundle 资源保持公开。
- 沙盒路由器按 `<sha256(token) 前缀>/<应用包目录>` 建键，沙盒请求的 session 携带同一用户键：同一应用包目录下每个凭据获得独立的、按 fixture 播种的内存沙盒。
- 浏览器在所有预览调用中携带 Token：沙盒 fetcher 与页面/测试/版本/发布面板附加 `Authorization`（读取认证存储的 localStorage key），`ui-uicp-nav` 的 `resolvePackagesRoot` 附加，编辑器窗口读取同一 key 并转发。

用户键是 Token 的哈希——原始凭据不会进入路由器 Map 或日志。同一浏览器配置仍是单用户（localStorage 每 origin 单 key）；多用户部署依赖每个用户独立的浏览器环境。

## 备选方案

- **为 ui-apppackage-workspace 增加 ui-uicp-nav client 依赖以复用 `getToken`**——已拒绝：需要重新解析 lockfile，当前环境无法完成；且 workspace 包本就为发布读取同一 localStorage key。
- **每次预览请求都向平台校验 JWT**——已拒绝：登录流程已在进入时校验，平台 API 每次请求自带校验；逐请求校验会给每个沙盒调用增加一次平台往返。seam 信任"存在 Token"；公网暴露时应增加带缓存的服务器端校验。

## 后果

同一服务器上的两个用户不再共享沙盒数据；每个凭据的 CRUD 编辑保留在各自的内存存储中。远程部署获得文件/发布路由的 Token 门禁。团队级共享是刻意的：磁盘上的应用包文件共享，并发保存为最后写入者胜；远程 JWT 移交必须走 HTTPS。
