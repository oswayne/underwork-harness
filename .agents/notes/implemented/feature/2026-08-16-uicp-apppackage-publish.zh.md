# Agent Note: UICP 应用包发布工具

Status: implemented

[English](2026-08-16-uicp-apppackage-publish.md) | 中文

## 问题

M3 验收要求跑通"生成 → 校验 → 预览 → 自动测试 → 采纳 → 保存"完整闭环，API 保存是最后一步。没有工具时只能手工跑 curl 序列，既无采纳闸门也无幂等。

## 决策

[`@deepseek-ai/dsh-tool-apppackage-publish`](../../../../packages/uicp/tool-apppackage-publish/README.md) 注册 `apppackage_publish`：要求 `adopted: true`，然后经轻量 HTTP 客户端（`Authorization` + `Tenant` 头）按 App → Entity → 字段 → 函数 → 菜单 → 页面顺序 upsert，先查后建、只创建缺失记录。fixture 数据绝不写入。HTTP 客户端可注入，测试跑在内存平台实现上。

## 曾考虑的替代方案

- **工具内复用 shell 导入脚本**——否决：工具不能为平台写入而 shell 出 curl；类型化客户端让错误结构化且可测试。

## 结果

四关门槛仍是模型调用本工具前的前置；API 保存是最后一步，平台侧人工快乐路径兜底保持人工执行。
