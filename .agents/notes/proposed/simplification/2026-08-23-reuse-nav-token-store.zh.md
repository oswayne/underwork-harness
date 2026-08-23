# Agent Note: 复用 nav Token 存储，取代重复的 localStorage key

Status: proposed

[English](2026-08-23-reuse-nav-token-store.md) | 中文

## 问题

平台 Token 的 localStorage key `uicp.platform.token` 在三处硬编码：`packages/client/ui-uicp-nav/src/client/token.ts`（属主）、`packages/client/ui-apppackage-workspace/src/client/sandbox-fetcher.ts`（其 `previewHeaders` 助手）以及 `packages/uicp/preview-backend/src/index.ts` 的编辑器窗口内联脚本。属主改 key 会静默破坏另两个读取者。

## 提案

从 `@deepseek-ai/dsh-client-ui-uicp-nav/client` 再导出 `getToken`，让 `ui-apppackage-workspace` 导入（此前因环境无法重新生成锁文件而推迟依赖；在可联网机器上执行 `pnpm install` 现已是既定步骤）。编辑器窗口无法导入 client 模块，仍读 localStorage，但尽量通过 nav 包公开导出的共享 key 常量，否则以注释说明。

## 备选方案

此前的拒绝是环境性的（针对私有 registry 的锁文件重解析失败），不是设计决定；共享 Token 存储才是正确的单一属主，workspace 包本就在发布流程里读同一 key。

## 验收标准

- `sandbox-fetcher.ts` 改用 nav client 导出的 `getToken()`，删除本地 `TOKEN_KEY` 常量。
- 测试断言 Authorization 头经存储而来；`pnpm run hygiene`（client 包依赖规则）在新声明依赖下通过。

## 风险

跨包导入耦合两个 fork client 包；两者同属 UICP 表面，依赖按 `verify-client-packages` 声明。编辑器窗口仍是浏览器专属特例。
