# Agent Note: UICP eureka 编辑器写回

Status: implemented

[English](2026-08-16-uicp-eureka-editor-writeback.md) | 中文

## 问题

M3 要求通过 eureka-editor 做局部干预：编辑结果写回应用包目录（唯一事实源）并重新通过校验。桌面 UI 尚未存在，因此写回路径必须做成可测试的接缝，而不是 UI 胶水。

## 决策

[`@deepseek-ai/dsh-eureka-preview-host`](../../../../packages/uicp/eureka-preview-host/README.md) 新增 `mountEurekaEditor`（镜像平台 `uicp-web-editor` 集成：`<Editor value onChange preview isMobile />`）与 `savePageSchema(fs, directory, pageIdentifier, schema)`。纯编辑状态（`createEditorHandle`）与写回逻辑已单测覆盖；渲染适配排除在每文件覆盖率之外（客户端通道欠债，`vitest.config.ts`），待浏览器级测试环境就绪。`eureka-editor` / `eureka-editor-core` 8.14.6 加入 bundle 的 React 19 依赖集。

## 曾考虑的替代方案

- **经沙盒 HTTP 路由持久化编辑**——否决：页面文件是 `ctx.fs` 拥有的工作区产物；文件系统接缝保持沙盒策略与单一写路径。

## 结果

宿主 UI 的保存动作变为 `savePageSchema` + 重跑 `apppackage_validate`；编辑器渲染仍随桌面 UI 装配（M0 壳）延后。bundle 体积不变，因为 eureka-editor 复用了已打包的 eureka-ui 内部依赖。
