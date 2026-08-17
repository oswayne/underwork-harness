# @deepseek-ai/dsh-uicp-api-proxy

[English](README.md) | 中文

本地 dsh web 宿主到 uicp 平台 API 的同源代理。Web UI 运行在 `http://127.0.0.1:<port>`，而平台只对已知来源响应浏览器 CORS，因此页面直接跨源请求会失败。该插件注册 `/uicp-api` 前缀路由：浏览器携带 `Authorization` / `Tenant` 头发起平台调用，宿主端把方法、请求体与这些头转发到配置的 upstream。

## 路由

`/uicp-api/<path>` 转发到 `<upstream>/<path>`：

- 转发 `authorization`、`tenant`、`content-type` 头；
- 转发请求方法与请求体（POST 及其他非 GET/HEAD 方法）；
- 原样回传上游 JSON 响应状态与内容；
- 上游失败返回 `502`，内容为 `{"status":502,"msg":"uicp-api-proxy: <error>","data":{}}`。

## 配置

```yaml
plugins:
  uicp-api-proxy:
    upstream: https://api.underwork.cn/uicp
```

`upstream` 字段必填；为空时插件加载失败。
