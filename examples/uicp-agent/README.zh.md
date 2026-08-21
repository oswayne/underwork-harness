# uicp-agent

[English](README.md) | 中文

本目录拥有 UICP 低代码平台驱动器无头工具面的回放与真实模型测试组合：一个根 agent，配 `apppackage_validate`、`apppackage_test`、`apppackage_version` 与 JSONL 持久化。它显式挂载共享 agent 主干、一个根 agent、持久化、检查点策略与本地文件系统栈；它不是第二个产品入口。

## 快照套件

[`tests/uicp.snapshot.ts`](tests/uicp.snapshot.ts) 启动回放组合（[`uicp.cordis.snapshot.yml`](uicp.cordis.snapshot.yml)），通过 `llm-replay` 为每个工具编排一次模型调用，对复制的 `sre-w` 演示包执行真实工具，并钉住规范化后的流与持久化会话日志。场景覆盖 AppPackage 驱动器的无密钥"校验 → 测试 → 版本"闭环。

```sh
# keyless replay
pnpm run test:snapshot -t 'uicp app-package'

# re-record goldens after an intended change
DSH_SNAPSHOT=refresh pnpm run test:snapshot -t 'uicp app-package'
```

## 使用真实模型运行

该组合是一个普通 Cordis 应用；导出 `DEEPSEEK_API_KEY` 后，用同一 fixture 驱动运行：

```sh
pnpm exec tsx examples/uicp-agent/tests/fixtures/headless-driver.ts \
  examples/uicp-agent/cordis.yml "validate the app package at app-packages/cszh/sre-w"
```

驱动输出的流是测试基础设施，不是受支持的 CLI 输出格式。
