/**
 * M2 preview seam: serves the self-contained eureka preview bundle and the
 * current app-package's page schema plus fixture data to the browser
 * workspace. Read-only and loopback-only; the full sandbox data path lands in
 * M3, so this seam is the minimal fixture preview bridge.
 * @module @deepseek-ai/dsh-uicp-preview-backend
 */

import { createRequire } from 'node:module'
import { readFile, readdir } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

export const name = 'uicp-preview-backend'
export const inject = ['webServer']

/** Preview seam configuration. */
export interface Config {
  /** App-packages root; defaults to the nearest `app-packages` walking up from cwd. */
  appPackagesRoot?: string
}

const require = createRequire(import.meta.url)
const PREVIEW_HOST_PKG = require.resolve('@deepseek-ai/dsh-eureka-preview-host/package.json')
const PREVIEW_DIST = join(dirname(PREVIEW_HOST_PKG), 'dist')
const BUNDLE_JS = join(PREVIEW_DIST, 'uicp-eureka-preview.js')
const BUNDLE_CSS = join(PREVIEW_DIST, 'uicp-eureka-preview.css')

/** Page identifier and entity identifiers are lowercase kebab-case. */
const IDENTIFIER = /^[a-z0-9][a-z0-9-]*$/

/**
 * Resolve the app-packages root: explicit config, else the nearest
 * `app-packages` directory walking up from the process cwd.
 * @param config - the seam configuration.
 * @returns the absolute app-packages root.
 */
export function resolveAppPackagesRoot(config: Config): string {
  if (config.appPackagesRoot !== undefined && config.appPackagesRoot !== '') {
    return resolve(config.appPackagesRoot)
  }
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    const candidate = join(dir, 'app-packages')
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate
    const parent = dirname(dir)
    if (parent === dir) return join(process.cwd(), 'app-packages')
  }
}

/**
 * Normalize and validate one app-package directory under the root. Rejects
 * traversal and anything outside the root.
 * @param root - the app-packages root.
 * @param cwdValue - the raw `cwd` query value.
 * @returns the normalized package directory, or undefined when invalid.
 */
export function resolvePackageDir(root: string, cwdValue: string | undefined): string | undefined {
  if (cwdValue === undefined || cwdValue === '') return undefined
  const rootNorm = resolve(root)
  const cwdNorm = resolve(cwdValue)
  if (cwdNorm !== rootNorm && !cwdNorm.startsWith(rootNorm + sep)) return undefined
  return cwdNorm
}

/** Extract entity identifiers referenced by one page JSON text. */
function referencedEntities(pageText: string): string[] {
  const ids = new Set<string>()
  for (const match of pageText.matchAll(/\/app-package\/entity\/([a-z0-9][a-z0-9-]*)\//g)) {
    const entity = match[1]
    if (entity !== undefined) ids.add(entity)
  }
  return [...ids]
}

/**
 * Handle `GET /uicp/preview/page?cwd=<dir>&page=<id>`: read the page JSON and
 * every referenced entity's fixture, answering `{ status, data: { schema,
 * fixtures } }`.
 * @param req - the incoming GET.
 * @param res - the response.
 * @param root - the app-packages root for path validation.
 */
export async function pageHandler(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const dir = resolvePackageDir(root, url.searchParams.get('cwd') ?? undefined)
  const pageId = url.searchParams.get('page') ?? undefined
  const json = (status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (dir === undefined) {
    json(400, { status: 400, msg: 'cwd must be an app-package directory under the app-packages root', data: null })
    return
  }
  const pageFile = pageId === undefined
    ? await firstPageFile(dir)
    : IDENTIFIER.test(pageId) ? join(dir, 'pages', `${pageId}.json`) : undefined
  if (pageFile === undefined || !existsSync(pageFile)) {
    json(404, { status: 404, msg: 'page not found in the app-package directory', data: null })
    return
  }
  try {
    const schema: unknown = JSON.parse(await readFile(pageFile, 'utf8'))
    const fixtures: Record<string, unknown[]> = {}
    for (const entity of referencedEntities(JSON.stringify(schema))) {
      const fixtureFile = join(dir, 'data', `${entity}.json`)
      if (!existsSync(fixtureFile)) continue
      const fixture: unknown = JSON.parse(await readFile(fixtureFile, 'utf8'))
      fixtures[entity] = fixture as unknown[]
    }
    json(200, { status: 0, data: { schema, fixtures } })
  } catch (error) {
    json(500, { status: 500, msg: error instanceof Error ? error.message : String(error), data: null })
  }
}

/** First page file in the app-package `pages/` directory. */
async function firstPageFile(dir: string): Promise<string | undefined> {
  const pageDir = join(dir, 'pages')
  if (!existsSync(pageDir)) return undefined
  const files = await readdir(pageDir)
  const page = files.find(file => file.endsWith('.json') && IDENTIFIER.test(file.slice(0, -5)))
  return page === undefined ? undefined : join(pageDir, page)
}

/** Serve one preview asset with its content type. */
async function serveFile(res: ServerResponse, path: string, contentType: string): Promise<void> {
  try {
    const body = await readFile(path)
    res.writeHead(200, { 'content-type': contentType })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ status: 404, msg: 'preview asset not found', data: null }))
  }
}

/**
 * Register the preview bundle and page/fixture routes.
 * @param ctx - host context with the webserver.
 * @param config - app-packages root override.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const root = resolveAppPackagesRoot(config)
  ctx.effect(
    () => {
      const disposers = [
        ctx.webServer.register({
          kind: 'exact',
          path: '/uicp/preview/bundle.js',
          handler: (_req, res) => { void serveFile(res, BUNDLE_JS, 'application/javascript') },
        }),
        ctx.webServer.register({
          kind: 'exact',
          path: '/uicp/preview/bundle.css',
          handler: (_req, res) => { void serveFile(res, BUNDLE_CSS, 'text/css') },
        }),
        ctx.webServer.register({
          kind: 'exact',
          path: '/uicp/preview/page',
          handler: (req, res) => { void pageHandler(req, res, root) },
        }),
      ]
      return () => {
        for (const disposer of disposers) disposer()
      }
    },
    'uicp-preview-backend: preview routes',
  )
}
