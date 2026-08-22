/**
 * Same-origin proxy from the local dsh web host to the uicp platform API.
 *
 * The web UI is served from `http://127.0.0.1:<port>` and the platform only
 * answers browser CORS for its own known origins, so direct cross-origin
 * fetches fail (`Load failed`). This route makes platform calls same-origin:
 * the browser requests `/uicp-api/<path>` with its Authorization/Tenant
 * headers, and the host forwards them to the configured upstream.
 * @module @deepseek-ai/dsh-uicp-api-proxy
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

export const name = 'uicp-api-proxy'
export const inject = ['webServer']

/** Proxy configuration. */
export interface Config {
  /** Platform API base, e.g. `https://api.underwork.cn/uicp`. */
  upstream: string
}

/**
 * Register the `/uicp-api` prefix route.
 * @param ctx - host context with the webserver.
 * @param config - upstream platform base.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.upstream === '') throw new Error('uicp-api-proxy: upstream is required')
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: '/uicp-api',
      handler: (req, res) => routeHandler(req, res, config.upstream),
    }),
    'uicp-api-proxy: platform route',
  )
}

const FORWARD_HEADERS = ['authorization', 'tenant', 'content-type'] as const

/**
 * Forward one request to the upstream and echo the JSON response.
 * @param req - the incoming request whose URL is rebased onto the upstream.
 * @param res - the response the upstream JSON is written to.
 * @param upstream - the platform API base URL.
 */
export async function routeHandler(
  req: IncomingMessage,
  res: ServerResponse,
  upstream: string,
): Promise<void> {
  try {
    const path = (req.url ?? '/').replace(/^\/uicp-api/, '')
    const headers: Record<string, string> = {}
    for (const name of FORWARD_HEADERS) {
      const value = req.headers[name]
      if (typeof value === 'string') headers[name] = value
    }
    const init: RequestInit = { headers }
    if (req.method !== undefined) init.method = req.method
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string | Uint8Array)
        chunks.push(buffer)
      }
      init.body = Buffer.concat(chunks)
    }
    const response = await fetch(`${upstream}${path}`, init)
    const text = await response.text()
    res.writeHead(response.status, { 'Content-Type': 'application/json' })
    res.end(text)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 502, msg: `uicp-api-proxy: ${message}`, data: {} }))
  }
}
