/**
 * M2/M3 app-package workspace seam: serves the self-contained eureka preview
 * bundle and the current app-package's page schema plus fixture data to the
 * browser workspace, and writes editor changes back to the local page file
 * with a static re-validation. Loopback-only; the full sandbox data path
 * lands in M3, so this seam is the minimal preview/editor bridge.
 * @module @deepseek-ai/dsh-uicp-preview-backend
 */

import { createRequire } from 'node:module'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { validatePackage, type Issue } from '@deepseek-ai/dsh-tool-apppackage-validate/src/validate.ts'
import {
  loadPackage, MemoryKvBackend, SandboxExecutor, SandboxRouter, SandboxStore,
} from '@deepseek-ai/dsh-sandbox-server'
import { generateCases } from '@deepseek-ai/dsh-tool-apppackage-test/src/cases.ts'
import { runSuite } from '@deepseek-ai/dsh-tool-apppackage-test/src/runner.ts'
import { loadFixtures } from '@deepseek-ai/dsh-tool-apppackage-test/src/index.ts'
import { HttpPlatformClient, publishPackage } from '@deepseek-ai/dsh-tool-apppackage-publish'
import type { CaseResult } from '@deepseek-ai/dsh-tool-apppackage-test/src/runner.ts'

export const name = 'uicp-preview-backend'
export const inject = ['webServer']

/** Preview seam configuration. */
export interface Config {
  /** App-packages root; defaults to the nearest `app-packages` walking up from cwd. */
  appPackagesRoot?: string
  /** Platform API base; defaults to the production UICP endpoint. */
  platformBase?: string
}

const require = createRequire(import.meta.url)
/** Production UICP platform base when the deployment names no override. */
const DEFAULT_PLATFORM_BASE = 'https://api.underwork.cn/uicp'
const PREVIEW_HOST_PKG = require.resolve('@deepseek-ai/dsh-eureka-preview-host/package.json')
const PREVIEW_DIST = join(dirname(PREVIEW_HOST_PKG), 'dist')
const BUNDLE_JS = join(PREVIEW_DIST, 'uicp-eureka-preview.js')
const BUNDLE_CSS = join(PREVIEW_DIST, 'uicp-eureka-preview.css')
const VALIDATE_PKG = require.resolve('@deepseek-ai/dsh-tool-apppackage-validate/package.json')
const EUREKA_SCHEMA = join(dirname(VALIDATE_PKG), 'data', 'eureka-schema.json')

/**
 * Standalone editor window: loads the self-contained preview bundle and
 * mounts the eureka editor full-page, with page switching and save (the
 * write-back + re-validation POST) handled in this window.
 */
const EDITOR_WINDOW_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Underwork Harness · 页面编辑器</title>
<link rel="stylesheet" href="/uicp/preview/bundle.css">
<style>
  html, body { height: 100%; margin: 0; overflow: hidden; background: #f7f7f9; }
  body { font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .bar { display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 12px; background: #fff; border-bottom: 1px solid #e8e9eb; box-sizing: border-box; }
  .bar-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #141a25; }
  .bar select, .bar button { height: 26px; border: 1px solid #d4d6d9; border-radius: 6px; background: #fff; color: #141a25; padding: 0 10px; cursor: pointer; }
  .bar button.primary { background: #2468f2; border-color: #2468f2; color: #fff; }
  .status { font-size: 12px; color: #84868c; }
  .status.ok { color: #27c24c; }
  .status.err { color: #a94442; }
  .issues { position: absolute; top: 40px; left: 0; right: 0; max-height: 30%; overflow: auto; margin: 0; padding: 8px 12px; list-style: none; background: #fff; border-bottom: 1px solid #e8e9eb; box-sizing: border-box; z-index: 10; font-size: 12px; line-height: 18px; }
  .issues li { display: flex; gap: 8px; padding: 2px 0; }
  .issues .sev { flex: none; }
  .issues .sev-error { color: #a94442; }
  .issues .sev-warning { color: #b8860b; }
  .issues .file { flex: none; color: #84868c; }
  #host { position: relative; height: calc(100% - 40px); }
</style>
</head>
<body>
  <div class="bar">
    <span class="bar-title">Underwork Harness · 页面编辑器</span>
    <label>页面 <select id="page"></select></label>
    <button id="save" class="primary">保存</button>
    <span id="status" class="status"></span>
    <button id="close">关闭</button>
  </div>
  <ul id="issues" class="issues"></ul>
  <div id="host"></div>
  <script src="/uicp/preview/bundle.js"></script>
  <script>
    (() => {
      const params = new URLSearchParams(location.search)
      const cwd = params.get('cwd') ?? ''
      const host = document.getElementById('host')
      const select = document.getElementById('page')
      const save = document.getElementById('save')
      const status = document.getElementById('status')
      const issues = document.getElementById('issues')
      let handle
      let currentPage
      function setStatus(text, ok) {
        status.textContent = text
        status.className = 'status' + (ok === true ? ' ok' : ok === false ? ' err' : '')
      }
      function renderIssues(list) {
        issues.innerHTML = ''
        for (const item of list ?? []) {
          const li = document.createElement('li')
          const sev = document.createElement('span')
          sev.className = 'sev sev-' + (item.severity === 'error' ? 'error' : 'warning')
          sev.textContent = item.severity === 'error' ? '错误' : '警告'
          const file = document.createElement('span')
          file.className = 'file'
          file.textContent = item.file + ' [' + item.rule + ']'
          const msg = document.createElement('span')
          msg.textContent = item.message
          li.append(sev, file, msg)
          issues.appendChild(li)
        }
      }
      async function savePage(value) {
        if (!currentPage) return
        setStatus('正在保存…')
        renderIssues([])
        const response = await fetch('/uicp/preview/page', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cwd, page: currentPage, value })
        })
        const body = await response.json()
        if (body.status !== 0 || body.data === undefined) throw new Error(body.msg ?? '保存失败')
        renderIssues(body.data.issues)
        setStatus(body.data.ok ? '已保存并通过校验' : '校验发现问题（' + body.data.issues.length + '）', body.data.ok)
      }
      async function load(wanted) {
        const query = new URLSearchParams({ cwd })
        if (wanted) query.set('page', wanted)
        setStatus('正在加载…')
        const response = await fetch('/uicp/preview/page?' + query)
        const body = await response.json()
        if (body.status !== 0 || body.data === undefined) throw new Error(body.msg ?? '加载失败')
        select.innerHTML = ''
        for (const page of body.data.pages ?? []) {
          const option = document.createElement('option')
          option.value = page.id
          option.textContent = page.title
          select.appendChild(option)
        }
        select.value = (body.data.pages ?? []).some(page => page.id === wanted) ? wanted : (body.data.pages?.[0]?.id ?? '')
        currentPage = select.value
        handle?.unmount()
        handle = window.UicpEurekaPreview.mountEurekaEditor(host, body.data.schema, { onSave: savePage })
        setStatus('')
      }
      select.addEventListener('change', () => { void load(select.value) })
      save.addEventListener('click', () => {
        try { handle?.save() } catch (error) { setStatus(String(error), false) }
      })
      document.getElementById('close').addEventListener('click', () => { window.close() })
      load(params.get('page') ?? undefined).catch(error => setStatus(String(error), false))
    })()
  </script>
</body>
</html>
`

/** A page id must be a single path segment (no separators or traversal). */
function safePageId(pageId: string): boolean {
  return pageId !== '' && pageId !== '.' && pageId !== '..'
    && !pageId.includes('/') && !pageId.includes('\\')
}

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
  for (const match of pageText.matchAll(/\/app-package\/entity\/([a-z0-9_-]+)\//g)) {
    const entity = match[1]
    if (entity !== undefined) ids.add(entity)
  }
  return [...ids]
}

/** One page entry in an app-package `pages/` directory. */
export interface PageInfo {
  /** Page identifier (the file basename without `.json`). */
  id: string
  /** Page title from the page JSON, falling back to the identifier. */
  title: string
}

/** List the app-package's pages with their titles, sorted by identifier. */
async function listPages(dir: string): Promise<PageInfo[]> {
  const pageDir = join(dir, 'pages')
  if (!existsSync(pageDir)) return []
  const pages: PageInfo[] = []
  for (const file of await readdir(pageDir)) {
    if (!file.endsWith('.json')) continue
    const id = file.slice(0, -5)
    let title = id
    try {
      const parsed = JSON.parse(await readFile(join(pageDir, file), 'utf8')) as { title?: unknown }
      if (typeof parsed.title === 'string' && parsed.title !== '') title = parsed.title
    } catch {
      // An unreadable page file still lists by identifier; the preview errors
      // when the user picks it.
    }
    pages.push({ id, title })
  }
  return pages.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * Handle `GET /uicp/preview/page?cwd=<dir>&page=<id>`: read the page JSON and
 * every referenced entity's fixture plus the page list, answering
 * `{ status, data: { schema, fixtures, pages } }`.
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
    : safePageId(pageId) ? join(dir, 'pages', `${pageId}.json`) : undefined
  const pageDir = join(dir, 'pages')
  const pageFiles = existsSync(pageDir)
    ? await readdir(pageDir).catch(() => [] as string[])
    : []
  if (pageFiles.length === 0) {
    json(404, {
      status: 404,
      msg: 'the app-package directory has no pages yet',
      data: { cwd: dir, pageFiles },
    })
    return
  }
  if (pageFile === undefined || !existsSync(pageFile)) {
    json(404, {
      status: 404,
      msg: 'page not found in the app-package directory',
      data: { cwd: dir, page: pageId ?? null, pageFiles },
    })
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
    json(200, { status: 0, data: { schema, fixtures, pages: await listPages(dir) } })
  } catch (error) {
    json(500, { status: 500, msg: error instanceof Error ? error.message : String(error), data: null })
  }
}

/** Read the JSON request body; rejects non-JSON payloads. */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    let text = ''
    req.on('data', (chunk) => { text += String(chunk) })
    req.on('end', () => {
      try {
        resolveBody(text === '' ? undefined : JSON.parse(text) as unknown)
      } catch {
        reject(new Error('request body must be JSON'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * Collect the contract-relevant files of one app-package directory into a
 * relative-path → content map for the static validator.
 * @param dir - the app-package directory.
 * @returns the file map.
 */
async function collectPackageFiles(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  const readNamed = async (name: string): Promise<void> => {
    const path = join(dir, name)
    if (existsSync(path)) files[name] = await readFile(path, 'utf8')
  }
  await readNamed('app.json')
  await readNamed('tenant.json')
  await readNamed('menus.json')
  for (const sub of ['entities', 'pages', 'data'] as const) {
    const subDir = join(dir, sub)
    if (!existsSync(subDir)) continue
    for (const entry of await readdir(subDir)) {
      if (entry.endsWith('.json')) files[`${sub}/${entry}`] = await readFile(join(subDir, entry), 'utf8')
    }
  }
  const funcsDir = join(dir, 'funcs')
  if (existsSync(funcsDir)) {
    for (const entity of await readdir(funcsDir)) {
      const entityDir = join(funcsDir, entity)
      if (!statSync(entityDir).isDirectory()) continue
      for (const entry of await readdir(entityDir)) {
        files[`funcs/${entity}/${entry}`] = await readFile(join(entityDir, entry), 'utf8')
      }
    }
  }
  return files
}

/** Validate one app-package directory against the frozen contract. */
async function validatePackageDir(dir: string): Promise<{ ok: boolean; issues: Issue[] }> {
  const files = await collectPackageFiles(dir)
  const result = validatePackage(files, {
    tenantDirName: basename(dirname(dir)),
    appDirName: basename(dir),
  }, await readFile(EUREKA_SCHEMA, 'utf8'))
  return { ok: result.issues.every(item => item.severity !== 'error'), issues: result.issues }
}

/**
 * Handle `POST /uicp/preview/page`: write an edited page schema back to the
 * app-package `pages/` directory and re-validate the package, answering
 * `{ status, data: { ok, issues } }`.
 * @param req - the incoming POST with `{ cwd, page, value }`.
 * @param res - the response.
 * @param root - the app-packages root for path validation.
 */
export async function savePageHandler(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
): Promise<void> {
  const json = (status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  let body: { cwd?: unknown; page?: unknown; value?: unknown }
  try {
    const parsed = await readJsonBody(req)
    if (typeof parsed !== 'object' || parsed === null) throw new Error('request body must be an object')
    body = parsed
  } catch (error) {
    json(400, { status: 400, msg: error instanceof Error ? error.message : String(error), data: null })
    return
  }
  const dir = resolvePackageDir(root, typeof body.cwd === 'string' ? body.cwd : undefined)
  const pageId = body.page
  if (dir === undefined) {
    json(400, { status: 400, msg: 'cwd must be an app-package directory under the app-packages root', data: null })
    return
  }
  if (typeof pageId !== 'string' || !safePageId(pageId)) {
    json(400, { status: 400, msg: 'page must be a single path segment', data: null })
    return
  }
  const value = body.value
  if (typeof value !== 'object' || value === null || Array.isArray(value) || (value as { type?: unknown }).type !== 'page') {
    json(400, { status: 400, msg: 'value must be a page schema', data: null })
    return
  }
  try {
    await writeFile(join(dir, 'pages', `${pageId}.json`), `${JSON.stringify(value, null, 2)}\n`)
    json(200, { status: 0, data: await validatePackageDir(dir) })
  } catch (error) {
    json(500, { status: 500, msg: error instanceof Error ? error.message : String(error), data: null })
  }
}

/** One sandbox setup: router plus the loaded package for case generation. */
interface SandboxSetup {
  router: SandboxRouter
  package: Awaited<ReturnType<typeof loadPackage>>
  fixtures: ReturnType<typeof loadFixtures>
}

/** Build an in-process sandbox setup for one package, seeded with fixtures. */
async function createSandboxSetup(dir: string): Promise<SandboxSetup> {
  const pkg = loadPackage(dir)
  const { entities, funcs } = pkg
  const fixtures = loadFixtures(dir)
  const store = new SandboxStore(new MemoryKvBackend(), entities)
  for (const [identifier, records] of fixtures) {
    for (const record of records) await store.insert(identifier, record)
  }
  const executor = new SandboxExecutor(store, funcs)
  return { router: new SandboxRouter({ store, executor, entities, funcs }), package: pkg, fixtures }
}

/** Per-package preview routers so CRUD edits persist for the workspace session. */
const previewRouters = new Map<string, Promise<SandboxSetup>>()

/** Resolve the cached preview router for one package directory. */
function getPreviewRouter(dir: string): Promise<SandboxRouter> {
  let router = previewRouters.get(dir)
  if (router === undefined) {
    router = createSandboxSetup(dir)
    previewRouters.set(dir, router)
  }
  return router.then(setup => setup.router)
}

/**
 * Run the generated app-package test suite against an in-process sandbox and
 * persist the cases to `tests/apppackage.cases.json`.
 * @param dir - the app-package directory.
 * @returns pass counts plus per-case outcomes.
 */
async function runPackageTests(dir: string): Promise<{
  ok: boolean
  cases: number
  passed: number
  failed: number
  results: CaseResult[]
}> {
  const { router, package: pkg, fixtures } = await createSandboxSetup(dir)
  const cases = generateCases(pkg.entities, pkg.funcs, fixtures)
  const results = await runSuite(router, cases)
  const passed = results.filter(result => result.passed).length
  const failed = results.length - passed
  await mkdir(join(dir, 'tests'), { recursive: true })
  await writeFile(join(dir, 'tests', 'apppackage.cases.json'), `${JSON.stringify(cases, null, 2)}\n`)
  return { ok: failed === 0, cases: cases.length, passed, failed, results }
}

/**
 * Handle `POST /uicp/preview/test`: run the package test suite and answer
 * `{ status, data: { ok, cases, passed, failed, results } }`.
 * @param req - the incoming POST with `{ cwd }`.
 * @param res - the response.
 * @param root - the app-packages root for path validation.
 */
export async function testHandler(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
): Promise<void> {
  const json = (status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (req.method !== 'POST') {
    json(405, { status: 405, msg: 'method not allowed', data: null })
    return
  }
  let body: { cwd?: unknown }
  try {
    const parsed = await readJsonBody(req)
    if (typeof parsed !== 'object' || parsed === null) throw new Error('request body must be an object')
    body = parsed
  } catch (error) {
    json(400, { status: 400, msg: error instanceof Error ? error.message : String(error), data: null })
    return
  }
  const dir = resolvePackageDir(root, typeof body.cwd === 'string' ? body.cwd : undefined)
  if (dir === undefined) {
    json(400, { status: 400, msg: 'cwd must be an app-package directory under the app-packages root', data: null })
    return
  }
  try {
    json(200, { status: 0, data: await runPackageTests(dir) })
  } catch (error) {
    json(500, { status: 500, msg: error instanceof Error ? error.message : String(error), data: null })
  }
}

/**
 * Handle workspace sandbox data requests on `/uicp/preview/entity/<path>`:
 * CRUD, query operators, stats/tree, and func execution against the current
 * package's in-process sandbox, with `cwd` taken from the query string.
 * @param req - the incoming request.
 * @param res - the response.
 * @param root - the app-packages root for path validation.
 */
export async function entityHandler(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
): Promise<void> {
  const json = (status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  try {
    const url = new URL(req.url ?? '/', 'http://sandbox.local')
    const dir = resolvePackageDir(root, url.searchParams.get('cwd') ?? undefined)
    if (dir === undefined) {
      json(400, { status: 400, msg: 'cwd must be an app-package directory under the app-packages root', data: null })
      return
    }
    const query: Record<string, string | string[] | undefined> = {}
    for (const key of url.searchParams.keys()) {
      if (key === 'cwd') continue
      const values = url.searchParams.getAll(key)
      query[key] = values.length === 1 ? values[0] : values
    }
    let body: unknown
    try {
      body = await readJsonBody(req)
    } catch {
      body = undefined
    }
    const router = await getPreviewRouter(dir)
    const response = await router.handle({
      method: req.method ?? 'GET',
      path: url.pathname.replace(/^\/uicp\/preview\/entity/, ''),
      query,
      body,
      session: 'uicp_workspace',
    })
    json(response.statusCode, response.body)
  } catch (error) {
    json(500, { status: 500, msg: error instanceof Error ? error.message : String(error), data: null })
  }
}

/** Top-level product directories excluded from version snapshots. */
const EXCLUDED_TOP_LEVEL = new Set(['tests', 'versions'])

/** Recursively collect product files, excluding tests/, versions/, and nested data session dirs. */
async function collectProductFiles(dir: string, rel = ''): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  const fullDir = rel === '' ? dir : join(dir, rel)
  for (const entry of await readdir(fullDir)) {
    const childRel = rel === '' ? entry : `${rel}/${entry}`
    const top = String(childRel.split('/')[0])
    if (EXCLUDED_TOP_LEVEL.has(top)) continue
    if (top === 'data' && childRel.split('/').length > 2) continue
    const childPath = join(fullDir, entry)
    if (statSync(childPath).isDirectory()) {
      for (const [path, content] of await collectProductFiles(dir, childRel)) files.set(path, content)
    } else {
      files.set(childRel, await readFile(childPath, 'utf8'))
    }
  }
  return files
}

/** Snapshot product files into `versions/<name>`; returns the version id. */
async function snapshotPackage(dir: string, name?: string): Promise<string> {
  const version = name ?? new Date().toISOString().replace(/[:.]/g, '-')
  const versionRoot = join(dir, 'versions', version)
  const files = await collectProductFiles(dir)
  for (const [rel, content] of files) {
    const target = join(versionRoot, rel)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  return version
}

/** Restore one version's files over the working directory; returns file count. */
async function restorePackage(dir: string, version: string): Promise<number> {
  const versionRoot = join(dir, 'versions', version)
  if (!existsSync(versionRoot)) throw new Error(`version not found: ${version}`)
  const files = await collectProductFiles(versionRoot)
  let count = 0
  for (const [rel, content] of files) {
    const target = join(dir, rel)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content)
    count += 1
  }
  return count
}

/** List version directories, newest first; empty when none exist. */
async function listPackageVersions(dir: string): Promise<string[]> {
  const versionsRoot = join(dir, 'versions')
  if (!existsSync(versionsRoot)) return []
  const versions: string[] = []
  for (const entry of await readdir(versionsRoot)) {
    if (statSync(join(versionsRoot, entry)).isDirectory()) versions.push(entry)
  }
  return versions.sort().reverse()
}

/**
 * Handle `POST /uicp/preview/version`: snapshot, list, or restore local
 * app-package versions, answering `{ status, data }` with the tool-shaped
 * result.
 * @param req - the incoming POST with `{ cwd, action, version? }`.
 * @param res - the response.
 * @param root - the app-packages root for path validation.
 */
export async function versionHandler(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
): Promise<void> {
  const json = (status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (req.method !== 'POST') {
    json(405, { status: 405, msg: 'method not allowed', data: null })
    return
  }
  let body: { cwd?: unknown; action?: unknown; version?: unknown }
  try {
    const parsed = await readJsonBody(req)
    if (typeof parsed !== 'object' || parsed === null) throw new Error('request body must be an object')
    body = parsed
  } catch (error) {
    json(400, { status: 400, msg: error instanceof Error ? error.message : String(error), data: null })
    return
  }
  const dir = resolvePackageDir(root, typeof body.cwd === 'string' ? body.cwd : undefined)
  if (dir === undefined) {
    json(400, { status: 400, msg: 'cwd must be an app-package directory under the app-packages root', data: null })
    return
  }
  const action = body.action
  try {
    if (action === 'list') {
      json(200, { status: 0, data: { ok: true, action: 'list', versions: await listPackageVersions(dir) } })
      return
    }
    if (action === 'snapshot') {
      const version = await snapshotPackage(dir, typeof body.version === 'string' ? body.version : undefined)
      json(200, { status: 0, data: { ok: true, action: 'snapshot', version } })
      return
    }
    if (action === 'restore') {
      if (typeof body.version !== 'string' || body.version === '') {
        json(400, { status: 400, msg: 'version is required for restore', data: null })
        return
      }
      const restored = await restorePackage(dir, body.version)
      json(200, { status: 0, data: { ok: true, action: 'restore', version: body.version, restored } })
      return
    }
    json(400, { status: 400, msg: `unknown action: ${String(action)}`, data: null })
  } catch (error) {
    json(500, { status: 500, msg: error instanceof Error ? error.message : String(error), data: null })
  }
}

/**
 * Handle `POST /uicp/preview/publish`: after explicit user adoption, upsert
 * the app-package onto the platform idempotently (App → Entity → fields →
 * funcs → menu → page; fixture data is never written).
 * @param req - the incoming POST with `{ cwd, baseUrl, token, tenantId, adopted }`.
 * @param res - the response.
 * @param root - the app-packages root for path validation.
 */
export async function publishHandler(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  platformBase: string = DEFAULT_PLATFORM_BASE,
): Promise<void> {
  const json = (status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (req.method !== 'POST') {
    json(405, { status: 405, msg: 'method not allowed', data: null })
    return
  }
  let body: { cwd?: unknown; token?: unknown; tenantId?: unknown; adopted?: unknown }
  try {
    const parsed = await readJsonBody(req)
    if (typeof parsed !== 'object' || parsed === null) throw new Error('request body must be an object')
    body = parsed
  } catch (error) {
    json(400, { status: 400, msg: error instanceof Error ? error.message : String(error), data: null })
    return
  }
  const dir = resolvePackageDir(root, typeof body.cwd === 'string' ? body.cwd : undefined)
  if (dir === undefined) {
    json(400, { status: 400, msg: 'cwd must be an app-package directory under the app-packages root', data: null })
    return
  }
  if (body.adopted !== true) {
    json(400, { status: 400, msg: '用户未采纳，拒绝写入平台', data: null })
    return
  }
  const { token, tenantId } = body
  if (typeof token !== 'string' || token === ''
    || typeof tenantId !== 'string' || tenantId === '') {
    json(400, { status: 400, msg: 'token、tenantId 均为必填', data: null })
    return
  }
  try {
    const summary = await publishPackage(dir, new HttpPlatformClient(platformBase, token, tenantId))
    json(200, { status: 0, data: summary })
  } catch (error) {
    json(500, { status: 500, msg: error instanceof Error ? error.message : String(error), data: null })
  }
}

/** First page file in the app-package `pages/` directory. */
async function firstPageFile(dir: string): Promise<string | undefined> {
  const pageDir = join(dir, 'pages')
  if (!existsSync(pageDir)) return undefined
  const files = await readdir(pageDir)
  const page = files.filter(file => file.endsWith('.json')).sort()[0]
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
 * Handle `GET /uicp/editor`: serve the standalone editor window page.
 * @param res - the response.
 */
export function editorWindowPage(res: ServerResponse): void {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(EDITOR_WINDOW_HTML)
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
          path: '/uicp/editor',
          handler: (_req, res) => { editorWindowPage(res) },
        }),
        ctx.webServer.register({
          kind: 'exact',
          path: '/uicp/preview/root',
          handler: (_req, res) => {
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ status: 0, data: { root } }))
          },
        }),
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
          handler: (req, res) => {
            if (req.method === 'POST') void savePageHandler(req, res, root)
            else void pageHandler(req, res, root)
          },
        }),
        ctx.webServer.register({
          kind: 'exact',
          path: '/uicp/preview/test',
          handler: (req, res) => { void testHandler(req, res, root) },
        }),
        ctx.webServer.register({
          kind: 'exact',
          path: '/uicp/preview/version',
          handler: (req, res) => { void versionHandler(req, res, root) },
        }),
        ctx.webServer.register({
          kind: 'prefix',
          path: '/uicp/preview/entity',
          handler: (req, res) => { void entityHandler(req, res, root) },
        }),
        ctx.webServer.register({
          kind: 'exact',
          path: '/uicp/preview/publish',
          handler: (req, res) => { void publishHandler(req, res, root, config.platformBase ?? DEFAULT_PLATFORM_BASE) },
        }),
      ]
      return () => {
        for (const disposer of disposers) disposer()
      }
    },
    'uicp-preview-backend: preview routes',
  )
}
