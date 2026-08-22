# Agent Note: UWA 模式 agent 命名

Status: implemented

[English](2026-08-22-uwa-agent-name.md) | 中文

## 问题

本 fork 的 UICP agent preset（`apps/cli/config/agent-presets/uicp/`）此前以"UICP 低代码平台生成驱动器"展示与自称；persona 与无头示例重复了通用驱动器称谓。产品需要一个稳定、简短的产品身份，供用户选择 agent 与模型自称。

## 决定

agent 在产品名出现之处统一命名为 **UWA 模式**：

- `apps/cli/config/agent-presets/uicp/preset.yml` 的 `name` 为 `UWA 模式`；preset 选择器与元数据展示该名称。
- `apps/cli/config/agent-presets/uicp/agent.cordis.yml` 的 persona 以 "You are UWA 模式, the UICP low-code platform generation driver …" 开头，模型以产品名自我介绍。
- 无头示例 `examples/uicp-agent/cordis.yml` 的内联 persona 使用相同开头。

技术驱动器名称（"UICP low-code platform driver"）与 `uicp` preset id 保持不变；本次重命名仅覆盖 agent 的产品身份。fork 的 Underwork 品牌上下文记录在[上游同步笔记](../process/2026-08-22-upstream-sync-0.1.1-rc2.zh.md)。

## 备选方案

- **将 preset id/目录 `uicp` 改为 `uwa`**——已拒绝：id 是被 profile 与文档引用的内部挂载键；本次决定命名 agent，而非重组装配键。
- **同步修改包 README 中的驱动器命名**——已拒绝：README 命名的是技术驱动器 seam，其契约名保持不变。

## 后果

用户在 preset 选择器中选择 "UWA 模式"，模型在系统提示中收到产品名。无 keyless 快照固定 persona 文本，重命名不会造成 golden 文件变动；后续再改名只需改 `preset.yml` 与两处 persona。
