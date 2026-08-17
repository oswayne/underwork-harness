import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import type { ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import {
  apply as applyInvariant, inject as invariantInject, name as invariantName,
} from '../src/invariant.ts'
import {
  pageHandler, resolveAppPackagesRoot, resolvePackageDir, savePageHandler,
} from '../src/index.ts'

let dir: string | undefined

afterEach(async () => {
  if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  dir = undefined
})

function fakeReq(url: string): never {
  return Object.assign(Readable.from([]), { method: 'GET', url, headers: {} }) as never
}

function fakePostReq(url: string, body: unknown): never {
  return Object.assign(Readable.from([JSON.stringify(body)]), { method: 'POST', url, headers: {} }) as never
}

function fakeRes(): { res: ServerResponse; captured: { statusCode: number; body: string } } {
  const captured = { statusCode: 0, body: '' }
  const res = {
    writeHead: (statusCode: number) => { captured.statusCode = statusCode },
    end: (body: string) => { captured.body = body },
  } as unknown as ServerResponse
  return { res, captured }
}

async function packageDir(): Promise<string> {
  if (dir !== undefined) return dir
  dir = await mkdtemp(join(tmpdir(), 'uicp-preview-'))
  await mkdir(join(dir, 'pages'))
  await mkdir(join(dir, 'entities'))
  await mkdir(join(dir, 'data'))
  await writeFile(join(dir, 'app.json'), JSON.stringify({
    name: 'App', identifier: basename(dir), description: '', version: '1.0.0', available: true, hidden: false,
    type: '官方', url: '', portable: true, category: '基础', runtime: '混合', requireRoles: '', requirePermissions: '',
  }))
  await writeFile(join(dir, 'tenant.json'), JSON.stringify({
    identifier: basename(dirname(dir)), name: 'Tenant', available: true,
  }))
  await writeFile(join(dir, 'menus.json'), '[]')
  await writeFile(join(dir, 'entities', 'order.json'), JSON.stringify({
    name: '订单', category: '', identifier: 'order', description: '', version: '1.0.0', tree: false, extra: {},
    fields: [
      { name: 'orderNo', label: '单号', type: '文本', unique: false, editable: true },
      { name: 'amount', label: '金额', type: '数字', unique: false, editable: true },
    ],
  }))
  await writeFile(join(dir, 'pages', 'order-list.json'), JSON.stringify({
    type: 'page',
    title: '订单管理',
    body: [{ type: 'crud', api: { method: 'get', url: '/app-package/entity/order/page' } }],
  }))
  await writeFile(join(dir, 'pages', 'order-detail.json'), JSON.stringify({
    type: 'page',
    title: '订单详情',
    body: [],
  }))
  await writeFile(join(dir, 'pages', 'order_detail.json'), JSON.stringify({
    type: 'page',
    title: '下划线页',
    body: [],
  }))
  await writeFile(join(dir, 'data', 'order.json'), JSON.stringify([
    { orderNo: 'SO-001', amount: 12.5 },
  ]))
  return dir
}

describe('resolveAppPackagesRoot', () => {
  it('walks up from cwd to the nearest app-packages directory', () => {
    expect(resolveAppPackagesRoot({})).toMatch(/app-packages$/)
  })

  it('honours an explicit root', () => {
    expect(resolveAppPackagesRoot({ appPackagesRoot: '/tmp/x' })).toBe('/tmp/x')
  })
})

describe('resolvePackageDir', () => {
  it('accepts a package directory under the root and rejects traversal', () => {
    expect(resolvePackageDir('/root', '/root/tenant/app')).toBe('/root/tenant/app')
    expect(resolvePackageDir('/root', '/root/../etc')).toBeUndefined()
    expect(resolvePackageDir('/root', '/etc')).toBeUndefined()
    expect(resolvePackageDir('/root', undefined)).toBeUndefined()
  })
})

describe('pageHandler', () => {
  it('serves the page schema and referenced fixtures', async () => {
    const app = await packageDir()
    const { res, captured } = fakeRes()
    await pageHandler(
      fakeReq(`/uicp/preview/page?cwd=${encodeURIComponent(app)}&page=order-list`),
      res,
      join(app, '..'),
    )
    expect(captured.statusCode).toBe(200)
    const body = JSON.parse(captured.body) as {
      status: number
      data: { schema: { type: string }; fixtures: Record<string, unknown[]>; pages: { id: string; title: string }[] }
    }
    expect(body.status).toBe(0)
    expect(body.data.schema.type).toBe('page')
    expect(body.data.fixtures.order).toHaveLength(1)
    expect(body.data.pages).toEqual([
      { id: 'order-detail', title: '订单详情' },
      { id: 'order-list', title: '订单管理' },
      { id: 'order_detail', title: '下划线页' },
    ])
  })

  it('serves pages whose ids are not strictly kebab-case', async () => {
    const app = await packageDir()
    const { res, captured } = fakeRes()
    await pageHandler(
      fakeReq(`/uicp/preview/page?cwd=${encodeURIComponent(app)}&page=order_detail`),
      res,
      join(app, '..'),
    )
    expect(captured.statusCode).toBe(200)
    const body = JSON.parse(captured.body) as { data: { schema: { title?: string } } }
    expect(body.data.schema.title).toBe('下划线页')
  })

  it('rejects a requested page outside the package and a bad cwd', async () => {
    const app = await packageDir()
    const missing = fakeRes()
    await pageHandler(fakeReq(`/uicp/preview/page?cwd=${encodeURIComponent(app)}&page=nope`), missing.res, join(app, '..'))
    expect(missing.captured.statusCode).toBe(404)
    const badCwd = fakeRes()
    await pageHandler(fakeReq('/uicp/preview/page?cwd=/etc'), badCwd.res, join(app, '..'))
    expect(badCwd.captured.statusCode).toBe(400)
  })

  it('registers its invariant companion under the package name', () => {
    expect(invariantName).toBe('uicp-preview-backend-invariant')
    expect(invariantInject).toEqual(['invariants'])
    expect(typeof applyInvariant).toBe('function')
  })
})

describe('savePageHandler', () => {
  it('writes the edited page back and reports a clean validation', async () => {
    const app = await packageDir()
    const { res, captured } = fakeRes()
    await savePageHandler(
      fakePostReq('/uicp/preview/page', { cwd: app, page: 'order-list', value: { type: 'page', title: '订单（改）', body: [] } }),
      res,
      join(app, '..'),
    )
    expect(captured.statusCode).toBe(200)
    const body = JSON.parse(captured.body) as { status: number; data: { ok: boolean; issues: unknown[] } }
    expect(body.status).toBe(0)
    expect(body.data.ok).toBe(true)
    expect(body.data.issues).toEqual([
      { severity: 'warning', file: 'funcs/', rule: 'package.empty', message: '没有函数' },
    ])
    const reread = fakeRes()
    await pageHandler(fakeReq(`/uicp/preview/page?cwd=${encodeURIComponent(app)}&page=order-list`), reread.res, join(app, '..'))
    const rereadBody = JSON.parse(reread.captured.body) as { data: { schema: { title: string } } }
    expect(rereadBody.data.schema.title).toBe('订单（改）')
  })

  it('reports validation findings for a non-conforming page', async () => {
    const app = await packageDir()
    const { res, captured } = fakeRes()
    await savePageHandler(
      fakePostReq('/uicp/preview/page', { cwd: app, page: 'order-list', value: { type: 'page', title: '坏页面', body: 42 } }),
      res,
      join(app, '..'),
    )
    expect(captured.statusCode).toBe(200)
    const body = JSON.parse(captured.body) as { status: number; data: { ok: boolean; issues: { severity: string }[] } }
    expect(body.status).toBe(0)
    expect(body.data.ok).toBe(false)
    expect(body.data.issues.some(item => item.severity === 'error')).toBe(true)
  })

  it('rejects a bad cwd, a page id with separators, and a non-page value', async () => {
    const app = await packageDir()
    const badCwd = fakeRes()
    await savePageHandler(fakePostReq('/uicp/preview/page', { cwd: '/etc', page: 'order-list', value: { type: 'page' } }), badCwd.res, join(app, '..'))
    expect(badCwd.captured.statusCode).toBe(400)
    const badPage = fakeRes()
    await savePageHandler(fakePostReq('/uicp/preview/page', { cwd: app, page: 'a/b', value: { type: 'page' } }), badPage.res, join(app, '..'))
    expect(badPage.captured.statusCode).toBe(400)
    const badValue = fakeRes()
    await savePageHandler(fakePostReq('/uicp/preview/page', { cwd: app, page: 'order-list', value: { type: 'crud' } }), badValue.res, join(app, '..'))
    expect(badValue.captured.statusCode).toBe(400)
  })
})
