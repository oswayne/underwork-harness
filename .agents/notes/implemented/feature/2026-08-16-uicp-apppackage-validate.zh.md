# Agent Note: UICP 应用包校验工具

Status: implemented

[English](2026-08-16-uicp-apppackage-validate.md) | 中文

## 问题

M2 让 agent 按冻结的目录契约生成应用包，但没有校验回路时模型无法自证输出：契约违背只会到平台导入时才暴露。生成驱动器需要一个静态闸门，把结构化问题与跨应用依赖回喂模型修正。

## 决策

新增 `uicp/` 包组，交付 [`@deepseek-ai/dsh-tool-apppackage-validate`](../../../../packages/uicp/tool-apppackage-validate/README.md)：`apppackage_validate` 工具经 `ctx.fs` 读取一个应用包目录（沙箱策略生效），按[应用包契约](../../../../app-packages/README.md)执行静态校验矩阵——包记录、Entity identifier 与字段、函数 meta 配对加 `vm.Script` 编译与外部依赖词汇检测、Eureka `schema.json` 页面校验、菜单挂载、fixture 字段/类型检查，以及基于正则的跨应用依赖提取（`getColl` / `__funcExecutor` / 页面实体 URL）。规范输出为 `{ ok, issues, dependencies }`；error 阻止发布，warning 需要审阅。

[uicp agent preset](../../../../apps/cli/config/agent-presets/uicp/agent.cordis.yml) 复制 `standard` 并追加工具行与 AppPackage 交付物 persona；[uicp-contract skill](../../../../.agents/skills/uicp-contract/SKILL.md) 提供速查摘要。新组登记在 `packages/README.md` 与 `tsconfig.host.json`；Eureka schema 以内置 `data/eureka-schema.json` 快照在运行时加载。

M2 范围刻意部分交付：identifier 白名单目前只做外部依赖词汇检测（完整沙箱词汇强制由 M3 沙盒 `vm` 上下文承担），依赖提取基于正则（动态拼接的 identifier 交人工确认），eureka 预览/编辑器延后到 eureka 依赖接入方式拍板之后。

## 曾考虑的替代方案

- **按产物类型拆多个校验工具**——否决：单一的 `apppackage_validate` 让"生成 → 校验 → 修复"循环保持一次调用、一份报告，各产物检查只是其中的独立函数。
- **直接用 `node:fs` 读文件**——否决：`ctx.fs` 保持 agent 文件工具已有的沙箱策略与工作区根约束。
- **把 `schema.json` 作为 JSON 模块或 TypeScript 文件导入**——否决：仓库现有包都不导入 JSON；运行时数据文件让源码模式与构建模式路径一致（`src/` 与 `lib/` 都是 `../data/`）。
- **依赖 eureka 私有 registry 提供 schema**——否决：本环境无法访问该 registry；内置快照加 M4 同步脚本保持"契约作为数据依赖"的方向。

## 结果

模型可在用户采纳前校验应用包，结构化规范输出进入修正回路。新包达到每文件 100% 覆盖率，preset 与 skill 无需改动上游即可被发现，方案的共享文件清单新增 `tsconfig.host.json`（项目引用）与 `packages/README.md`（组行）。内置 schema 需随 Eureka 发布同步（M4 脚本），eureka 预览仍是 M2 的未决决策。
