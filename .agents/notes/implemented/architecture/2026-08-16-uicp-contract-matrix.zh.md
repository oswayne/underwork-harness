# Agent Note: UICP 契约矩阵

Status: implemented

[English](2026-08-16-uicp-contract-matrix.md) | 中文

## 问题

M4 保真闸门要求同一语料同时跑本地沙盒与真实平台基准并报告差异。现有工具测试按包覆盖行为，但没有被两个目标共享的钉住语料。

## 决策

[`@deepseek-ai/dsh-contract-matrix`](../../../../packages/uicp/contract-matrix/README.md) 提供固定语料（全部 18 个操作符、回退/跳过语义、排序、分页、`_preventListAll`、stats、日期/布尔转换、带唯一与构造函数生命周期的 CRUD、静态/对象函数路径、树形查询与分支）以及 `runMatrix` / `diffMatrix`。`buildReferenceTarget()` 用固定 `_id` 种子构建确定性进程内沙盒作为本地基准；平台适配器在基准环境就绪时接入。

## 曾考虑的替代方案

- **从应用包 fixture 派生矩阵**——否决：闸门需要固定、与具体示例包无关的契约语料。

## 结果

语料已钉住沙盒行为（78 个 uicp 用例、100% 覆盖），差异执行器为平台端点就绪；沙盒 insert 现在按字段类型解析值（镜像 `Field.parse`），这是矩阵日期/布尔用例的要求。
