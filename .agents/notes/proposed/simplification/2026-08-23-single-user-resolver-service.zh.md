# Agent Note: 共享单一用户解析器，取代每插件实例

Status: proposed

[English](2026-08-23-single-user-resolver-service.md) | 中文

## 问题

`packages/uicp/user-identity` 的 `createUserResolver` 在同一进程里被两个插件实例化：`uicp-user-identity` 自身路由与 `uicp-project-git`（其 `apply` 调用 `createUserResolver(config)`）。每个实例各持一份凭据缓存与一个 `UserStore`，且都向同一份 `$DSH_HOME/uicp-users/users.jsonl` 台账追加：同一 Token 最多会对平台自检两次，两个 store 并发写同一文件。

## 提案

`uicp-user-identity` 以 cordis 服务提供共享解析器（如 `ctx.uicpUser.resolve(token)`），`uicp-project-git` 改为注入 `uicpUser` 而非自建解析器。服务持有单一缓存、单一 `UserStore`、单一 JSONL 写入者。

## 备选方案

双实例目前无害（追加为最后写入胜；缓存未命中只是每插件每 Token 多一次平台调用）。但随着每个新消费者（M5 归属 seam、P2 展示）增长，重复会放大，且两份缓存使"按凭据缓存"的保证变得模糊。

## 验收标准

- 只有 `uicp-user-identity` 构造解析器；`uicp-project-git` 经 inject 消费。
- 同一进程内两个插件回答同一 Token 只触发一次平台自检、一次台账追加。
- 现有路由测试与 100% 覆盖率保持绿色。

## 风险

引入服务会在 fork 包之间增加一条 cordis 依赖边；替代方案是永远接受每插件缓存。服务面只有一个方法，不扩大上游接触面。
