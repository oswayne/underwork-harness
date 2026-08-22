# `@deepseek-ai/dsh-uicp-web-app`

[English](README.md) | 中文

UICP Web 表面 bundle。[`cordis.patch.yml`](cordis.patch.yml) 叠加在 [`dsh-web-app`](../web-app/README.zh.md) 之上：插入同源平台 API 代理（`/uicp-api/*`）、应用包预览 seam、UICP 侧边栏导航和应用包 workspace，并将 directory-picker 固定为 browse 后端，使租户切换可以编程式创建应用包目录。所有行引用的插件归各包所有；本 bundle 只声明它们及其 peer 提供者。

## Model Experience

间接地，通过被插入的行：本 bundle 自身不贡献任何模型可见文本。

#### KV Cache effect

无直接影响；每个被插入行的包拥有其效果。

## Known Limitations and Deferred Work

- **纯 patch bundle** —— 本包不携带运行时代码；每行挂载的行为归引用的包所有。
