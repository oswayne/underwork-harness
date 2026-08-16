# uicp/ — UICP low-code platform driver

English | [中文](README.zh.md)

The UICP low-code platform driver turns dsh into a generation driver for the uicp platform: the app-package directory is the bridgehead and single source of truth (contract in [app-packages/README.md](../../app-packages/README.md)), and the sandbox, publish, tests, and versioning tools build on it.

| Package | Role | ctx key |
|---|---|---|
| [`tool-apppackage-validate/`](tool-apppackage-validate/README.md) | Static validation + dynamic cross-app dependency analysis | — |

The design and implementation documents are [UPGRADE.md](../../UPGRADE.md) and [IMPLEMENTATION.md](../../IMPLEMENTATION.md).
