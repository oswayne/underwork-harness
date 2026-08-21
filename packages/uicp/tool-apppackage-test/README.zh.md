# @deepseek-ai/dsh-tool-apppackage-test

[English](README.md) | 中文

面向模型的 UICP 应用包自动测试执行器。工具从应用包目录构建进程内沙盒（数据 + 查询 + 函数执行），写入 fixture 数据，按契约生成正例/反例/边界用例，执行并输出结构化的通过/失败/跳过报告。

## 工具

`apppackage_test(directory)`：

- 按 Entity 生成用例：insert（使用不冲突的唯一值）、唯一重复拒绝、list、分页查询、`_preventListAll` 拒绝、数字字段 `gt` 过滤、树形实体 tree 查询；
- 按函数生成用例：静态函数调用、对象函数缺失记录（404）、构造函数触发 insert；使用外部依赖词汇（`axios` / `ai` / `requireAdapter`）的函数跳过并标记"依赖人工处理"；
- 每个用例在本地沙盒执行并断言 `{ status, msg, data }` 信封；
- 生成的用例沉淀到 `tests/apppackage.cases.json`，供审阅与扩展。

规范输出为 `{ ok, cases, passed, failed, results: [{ name, passed, skipped?, message }] }`；任一用例失败即 `ok: false`，进入模型的修复回路。

## 模型体验

### apppackage_test

#### What the model sees

工具描述指导模型在 `apppackage_validate` 之后、采纳之前运行测试；终端渲染每个用例一行 `PASS` / `FAIL` / `SKIP`，失败附带断言信息。

#### Token effect

每次调用产生一条工具调用记录；除工具自身描述与结果外不增加请求前缀。

#### KV Cache effect

不使主请求失效；工具调用不改变对话的提示前缀。

## 已知局限与延后工作

- 用例来自模板 + 参数化生成；领域专属场景通过编辑 `tests/apppackage.cases.json` 补充。
- 对真实平台基准的行为矩阵契约套件是 M4 保真闸门；本工具运行无 key 的本地镜像。
