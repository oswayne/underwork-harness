# @deepseek-ai/dsh-contract-matrix

[English](README.md) | 中文

uicp 数据沙盒的行为矩阵契约语料与双端执行器。固定语料覆盖全部查询操作符、CRUD、stats、树形、构造函数与函数错误语义；执行器可对任意请求/响应目标运行，并可对两个目标（沙盒 vs 平台）做差异比对，支撑 M4 保真闸门。

## 语料

`buildMatrix()` 返回针对 `matrix` 实体的规范用例：

- 全部操作符（`like` / `notLike` / `isNull` / `isNotNull` / `isBlank` / `isNotBlank` / `in` / `notIn` / `eq` / `ne` / `gt` / `ge` / `gte` / `lt` / `le` / `lte` / `between` / `notBetween`）、未知操作符回退、空值跳过；
- 排序方向、分页边界、`_preventListAll`、stats count/sum、日期与布尔转换；
- 带唯一与构造函数生命周期语义的 CRUD、静态/对象函数路径、树形查询与分支。

## 目标

- `buildReferenceTarget()` 构建带确定性种子 id（`seed-1..3`、`tree-1..2`）的全新进程内沙盒作为本地基准。
- `runMatrix(target, cases)` 报告逐用例通过/失败；`diffMatrix(left, right, cases)` 报告差异，供平台基准端点接入后的沙盒-平台比对。

## 平台首次运行（2026-08-16）

对真实平台（dsh-test）运行语料结果为 **37/45 一致**；8 项差异全部是平台侧行为缺口，沙盒按契约执行：

- 数字字段的 `eq` / `ne` 用字符串（`{ amount: '20' }`）与存储的数字比较，匹配不到任何记录。
- 数字字段的 `in` / `notIn` / `between` / `notBetween` 按逗号分隔字符串比较，不做类型转换。
- `ge` / `le` 生成非法 Mongo 操作符 `$ge` / `$le`，报 HTTP 500。

这些是需要报给平台维护方的平台侧缺陷；沙盒保持契约忠实，矩阵在平台收敛前持续标记它们。

## Model Experience

None，因为语料在模型请求之外运行，不注册任何模型面向的内容。

#### KV Cache effect

无；矩阵既不组装也不发送 provider 请求。

## 已知局限与延后工作

- 平台端目标适配器待基准环境；差异执行器已就绪并用假目标做了单测。
