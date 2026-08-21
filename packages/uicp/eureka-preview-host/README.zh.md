# @deepseek-ai/dsh-eureka-preview-host

[English](README.md) | 中文

UICP 低代码驱动器的自包含 Eureka 页面预览。该 bundle 自带 React 19 + eureka 运行时（eureka 8.14.6 要求 React 19，而 dsh Web UI 保持 React 18），因此预览可挂载到任意 DOM 节点且无需 iframe：宿主应用动态加载构建产物并调用 `mountEurekaPreview(container, schema, env)`。

## API

- `mountEurekaPreview(container, schema, env)` 把页面 JSON（顶层 `type: "page"`）渲染进 `container`，使用调用方的 `fetcher`，返回 `{ unmount() }`。
- `env.fetcher` 必须返回平台形状的响应 `{ status, msg, data }`；组装后的应用由 UICP 沙盒 host 提供。
- 可选 `env.theme`（默认 `cxd`）、`env.locale`（默认 `zh-CN`）、`env.isCancel`、`env.copy`。

## 编辑器写回

- `mountEurekaEditor(container, schema, env)` 挂载 eureka 可视化编辑器（React 19，同一隔离 bundle），返回带 `getValue()` / `setValue()` / `save()` 的句柄；`save()` 以当前 schema 调用 `env.onSave`。
- `savePageSchema(fs, directory, pageIdentifier, schema)` 经调用方的文件系统接缝写入 `pages/<identifier>.json`（两空格 JSON + 末尾换行），宿主 UI 借此把编辑结果持久化到本地应用包目录，再重跑 `apppackage_validate`。

## 构建

`pnpm run build:preview` 产出 `dist/uicp-eureka-preview.js`（IIFE，`UicpEurekaPreview`）及其 CSS 资源。React 19 运行时内置其中，与宿主应用的 React 18 完全隔离。

## Model Experience

None，因为浏览器预览 bundle 在客户端渲染页面 JSON，不注册任何模型面向的内容。

#### KV Cache effect

无；该 bundle 既不组装也不发送 provider 请求。

## 已知局限与延后工作

- 预览使用调用方的 fetcher；沙盒数据路径（`/app-package/entity/...`）在 M3 接通。
- eureka 编辑器写回属于 M3 范围；本包只负责渲染。
- bundle 体积较大（约 13 MB，含 monaco 与 eureka-ui 内部依赖），按设计作为懒加载 chunk；编辑器的 `json` 语言导入不在此预览构建中。
- 可视化编辑器渲染需要浏览器级测试环境；其纯编辑状态与写回逻辑已单测覆盖，渲染适配在客户端测试通道成熟前排除在每文件覆盖率之外。
