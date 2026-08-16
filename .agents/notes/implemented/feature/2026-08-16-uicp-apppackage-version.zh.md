# Agent Note: UICP 应用包本地版本

Status: implemented

[English](2026-08-16-uicp-apppackage-version.md) | 中文

## 问题

M3 需要本地版本快照，让草稿在采纳前可审阅、可切换、可回滚，且不影响平台历史。没有工具时回滚只能手工复制文件。

## 决策

[`@deepseek-ai/dsh-tool-apppackage-version`](../../../../packages/uicp/tool-apppackage-version/README.md) 注册 `apppackage_version`，提供 `snapshot` / `list` / `restore` 动作，全部走 `ctx.fs`。快照把产物文件（app.json / tenant.json / menus.json / entities / funcs / pages / data fixture）拷贝到 `versions/<name>/`，排除 `tests/`、`versions/` 与 `data/<session>/` 下的会话数据。

## 曾考虑的替代方案

- **用 git 管草稿**——否决：应用包目录可能不在本仓库内，且方案明确把版本快照与 git 提交历史分离。

## 结果

恢复后按工具指引重新校验与测试。保留上限与差异视图延后，因为 `ctx.fs` 尚无删除 API。
