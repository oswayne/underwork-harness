# Agent Note: UICP 应用包无密钥快照

Status: implemented

[English](2026-08-21-uicp-apppackage-snapshot.md) | 中文

## 问题

M4 验收清单的未决项是 UICP 驱动器组装面的无密钥快照：工具单测与契约矩阵覆盖了各包，但没有一个可运行示例能在无模型密钥的情况下回放覆盖 `apppackage_validate` / `apppackage_test` / `apppackage_version` 的组装 agent 闭环。

## 决策

[`examples/uicp-agent`](../../../../examples/uicp-agent/README.md) 拥有一个无头组合（agent 主干 + 三个 AppPackage 工具 + JSONL 持久化）与回放套件：通过 `llm-replay` 为每个工具编排一次模型调用，对复制的 `sre-w` 演示包（外加一个静态函数，使沙盒测试工具有可加载的 `funcs/` 树）执行真实工具，并钉住规范化后的流与持久化会话日志。场景还断言版本快照物化了产品文件且排除了 `tests/` 与 `versions/` 树。

## 备选方案

- **挂载完整 `uicp` agent preset**——否决：preset 携带 web/浏览器、计划模式、委托与目标行，无头回放既不执行它们也不希望它们进入 golden；preset 挂载机制由自身的包测试覆盖。
- **在回放内从头生成应用包**——否决：手写模型产出的文件内容会使 golden 脆弱，而对已提交的演示包执行校验/测试/版本管理则能确定性地覆盖同一工具面。

## 影响

回放完全无密钥且确定（生成的沙盒套件对播种后的演示包 37/37 全绿）。Golden 规范化会话 id、cwd 与时间戳，因此新临时工作区可逐字节回放一致。Golden 只通过显式 `DSH_SNAPSHOT=refresh` 变更，演示包漂移会以回放 diff 而非静默 fixture 翻动呈现。
