# Agent Note: 上游同步至 dsh 0.1.1-rc.2

Status: implemented

[English](2026-08-22-upstream-sync-0.1.1-rc2.md) | 中文

## 问题

本 fork 跟踪 deepseek-harness 0.1.0-rc.5；上游推进了 854 个提交至 `b150a551b8`（0.1.1-rc.2），重构了客户端壳（web-react → ui-renderer、schema-form 拆分、基于 slot 的品牌体系、client-modules 启动 facade）与构建门禁。合并需要在保留 fork 的 Underwork 品牌与 UICP 组装的前提下，把 UICP 驱动器落到新基线上。

## 决策

将 `master` 快进到上游，合并进 `codex/uicp-m0`，按上游新架构解决 17 个文件的冲突面：

- 品牌迁移到新品牌槽位（`sidebar.brand.mark` / `sidebar.brand.name` / `conversation.hero.brand.mark`），由 ui-uicp-nav 注册占用组件；上游 FishLogo/BrandWordmark 与 fork 的 AppLogo/AppWordmark 共存。
- 合并后的 `pnpm-lock.yaml` 把根包 `@testing-library/react` 解析成了 react 18 + react-dom 19 混合变体（react 19 由 eureka-preview-host 引入），导致所有客户端组件渲染为空。根 `package.json` 现显式钉住 react/react-dom 18 devDependencies，使根 peer 解析保持一致。
- `apps/web/dist` 仍是合并前 bundle，而服务端注入新的 client-modules 启动 facade，两者冲突触发 "window.__ModuleLoader__ already installed (double boot?)"。重建前端恢复一致启动；fork 的 Web 标题在 `apps/web/vite.config.ts` 钉为 Underwork Harness（HTML 注入 + `process.env.DSH_CLIENT_TITLE` define 兜底）。
- fork 不支持外部 CLI 产品集成（Codex / Claude Code 子代理提供方；uicp preset 本就禁用），相关 real-product 套件默认跳过，除非设置 `DSH_RUN_CLI_PRODUCT_TESTS=1`。

## 备选方案

- **从头重新生成 lockfile**——否决：会按私有 registry 重新解析全部范围，偏离上游钉住版本；根包一个 react/react-dom 钉住即可修复唯一损坏的 peer 解析。
- **保留合并前 `brand` 服务**——否决：上游 slot 架构已取代它；两者共存会留下死注册与类型漂移。

## 影响

fork 现可基于 0.1.1-rc.2 编译与测试（host + client 构建通过；UICP/UI 套件与 keyless 应用包快照全绿；built-boot smoke 可启动重建后的前端）。超出手册原清单的共享文件差异为根 `package.json`（react 钉住）、`apps/web/vite.config.ts`（标题）、`apps/web/index.html`（标题/图标）——已记入 IMPLEMENTATION.md 第 12 章。全量单测剩余失败均为环境限制（并行负载抖动在孤立运行中通过；外部 CLI 产品套件现按策略跳过）。
