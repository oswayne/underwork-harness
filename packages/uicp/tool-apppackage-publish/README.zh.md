# @deepseek-ai/dsh-tool-apppackage-publish

[English](README.md) | 中文

面向模型的 UICP 应用包 API 保存。用户显式采纳（`adopted: true`）后，工具按 App → Entity → 字段 → 函数 → 菜单 → 页面顺序幂等 upsert 目录到平台，按 identifier/路径复用已有记录。fixture 数据绝不写入平台。

## 工具

`apppackage_publish(directory, baseUrl, token, tenantId, adopted)`：

- 未传 `adopted: true` 直接拒绝（用户采纳是显式闸门）；
- 先查后建，只创建缺失记录，重复执行幂等；
- 不写 `data/` fixture（仅本地沙盒）；
- 返回 `{ ok, appId, created: { app, entities, fields, funcs, menu, page } }`。

四关门槛（静态校验、自动测试、沙盒-平台契约一致性、用户采纳）由模型在调用本工具前完成。

## 模型体验

### apppackage_publish

#### What the model sees

工具描述明确 API 保存是最后一步且必须经用户显式采纳；终端渲染报告新建与复用情况，模型据此与用户确认结果。

终端渲染以 `created: app=<bool> entities=<n> fields=<n> funcs=<n> menu=<n> page=<n>` 形式的单行摘要报告新建与复用，模型据此与用户确认本次保存的结果。

#### Token effect

每次调用产生一条工具调用记录；除工具自身描述与结果外不增加请求前缀。

#### KV Cache effect

不使主请求失效；工具调用不改变对话的提示前缀。

## 已知局限与延后工作

- 平台侧回滚不在范围（由平台处理）；跨应用依赖的发布顺序提示由 `apppackage_validate` 给出。
