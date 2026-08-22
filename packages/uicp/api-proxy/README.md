# @deepseek-ai/dsh-uicp-api-proxy

English | [中文](README.zh.md)

Same-origin proxy from the local dsh web host to the uicp platform API. The web UI is served from `http://127.0.0.1:<port>` and the platform only answers browser CORS for its known origins, so direct cross-origin fetches fail. This plugin registers the `/uicp-api` prefix route: the browser sends platform calls with its `Authorization` / `Tenant` headers, and the host forwards method, body, and those headers to the configured upstream.

## Route

`/uicp-api/<path>` forwards to `<upstream>/<path>`:

- forwards `authorization`, `tenant`, and `content-type` headers;
- forwards the request method and body (POST and other non-GET/HEAD methods);
- echoes the upstream JSON response status and body;
- upstream failure returns `502` with `{"status":502,"msg":"uicp-api-proxy: <error>","data":{}}`.

## Configuration

```yaml
plugins:
  uicp-api-proxy:
    upstream: https://api.underwork.cn/uicp
```

The `upstream` field is required; an empty value fails the plugin load.

## Model Experience

None, as the proxy forwards already-composed platform requests and registers nothing model-facing.

#### KV Cache effect

None; the proxy neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- The proxy requires the platform to be reachable; there is no offline mode, and responses pass through without transformation.
- The `upstream` base is static per deployment; request paths rebase `/uicp-api/*` onto it without tenant-specific routing.
