# Agent Note: UICP eureka schema 同步脚本

Status: implemented

[English](2026-08-16-uicp-eureka-schema-sync.md) | 中文

## 问题

`tool-apppackage-validate` 用内置的 `data/eureka-schema.json` 快照校验 Eureka 页面 JSON。没有同步路径时，快照会与已安装的 `eureka` 版本漂移，校验会静默地对着过期的契约把关。

## 决策

[`scripts/uicp-sync-eureka-schema.ts`](../../../../scripts/uicp-sync-eureka-schema.ts) 把内置 schema 与工作区已安装、钉住版本的 `eureka` 包的 `schema.json` 导出做对比，并选择拷贝（`pnpm run sync:eureka-schema`）或在检查模式（`--check`，供 CI）报告漂移。事实源是工作区安装的包版本，而不是第二个 URL 或本地仓库路径。

## 曾考虑的替代方案

- **检查时从私有 registry 拉取 schema**——否决：CI 可能没有 registry 访问；已安装的包已经钉版本且由安装验证。

## 结果

schema 升级随包更新：升级 `eureka`、运行同步脚本、在同一改动里提交内置快照。`--check` 让漂移成为门禁失败。
