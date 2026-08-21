# @deepseek-ai/dsh-sandbox-server

[English](README.md) | 中文

UICP 低代码驱动器的本地数据沙盒。host 插件在 `ctx.webServer` 上提供 `/app-package/entity/...` REST 语义——CRUD、查询操作符、stats/树形、基于 vm 的函数执行——数据按会话经 `ctx.storage` 持久化。Eureka 页面用同一批路径预览，页面 JSON 无需按环境改写。

## 契约保真

- 查询组装镜像 uicp `DataQueryApp` / `Field`：方括号键平铺、`like` 正则转义、完整操作符集（`like` / `notLike` / `isNull` / `isNotNull` / `isBlank` / `isNotBlank` / `in` / `notIn` / `eq` / `ne` / `gt` / `ge` / `gte` / `lt` / `le` / `lte` / `between` / `notBetween`）、字段类型转换、`_sort`、`_preventListAll` 与 `{ items, total, page }` 分页。
- 函数执行镜像 `Func.exec`：vm 上下文中 `(async () => { body })()`，注入内部词汇（`getColl` / `ObjectId` / `dayjs` / `crypto` / `Buffer` / `Decimal` / `console` / `__env` / `__funcExecutor` / `reportError` / `reportService`）；不注入外部依赖词汇。构造函数在单条 insert 落库前执行、按其 status 中止；`insertBatch` 不触发。
- 树形模式镜像 `setTreeData`（`parent` / `path` / `level`）、`findAsTree` 与分支前缀查询。

## 配置

```yaml
- id: sandbox-server
  name: '@deepseek-ai/dsh-sandbox-server'
  config:
    packageDir: app-packages/cszh/dsh-test
    session: default
    maxBodyBytes: 4194304
    backendName: json
```

`packageDir` 必填。`backendName` 选择暴露 KV facet 的 `ctx.storage` 后端（默认 `json`）；无 facet 的后端加载即失败。

## Model Experience

None，因为本地数据沙盒只应答 HTTP 数据路由，不注册任何模型面向的内容。

#### KV Cache effect

无；沙盒既不组装也不发送 provider 请求。

## 已知局限与延后工作

- 对真实平台基准的行为矩阵契约测试是 M4 保真闸门；本包是本地镜像。
- 上传端点返回 mock（`mock://upload`）；真实上传不进入沙盒。
