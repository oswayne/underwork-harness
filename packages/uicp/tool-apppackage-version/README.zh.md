# @deepseek-ai/dsh-tool-apppackage-version

[English](README.md) | 中文

面向模型的 UICP 应用包本地版本管理。工具把产物文件（app.json / tenant.json / menus.json / entities / funcs / pages / data fixture）快照到 `versions/<name>/`，列出快照，并把某个版本恢复到工作目录。

## 工具

`apppackage_version(directory, action, version?)`：

- `snapshot` 把产物文件拷贝进 `versions/`（名称默认时间戳）；排除 `tests/`、`versions/` 与 `data/<session>/` 下的沙盒会话数据。
- `list` 按最新优先报告快照。
- `restore` 把某个版本的文件覆盖回工作目录，返回文件数。

规范输出为 `{ ok, action, version?, versions?, restored? }`。快照仅限本地：平台 `PageVersion` 历史不受影响。

## 模型体验

工具描述指导模型在平台同步或采纳发布前打快照；恢复后重新跑 `apppackage_validate` 与 `apppackage_test`。

## 已知局限与延后工作

- 保留上限与差异视图延后：`ctx.fs` 目前没有删除 API，快照会累积，M4 增加裁剪。
