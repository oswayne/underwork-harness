import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { publishPackage } from '@deepseek-ai/dsh-tool-apppackage-publish'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  apply as applyInvariant, inject as invariantInject, name as invariantName,
} from '../src/invariant.ts'
import {
  apply,
  editorWindowPage,
  entityHandler,
  pageHandler,
  publishHandler,
  resolveAppPackagesRoot,
  resolvePackageDir,
  savePageHandler,
  testHandler,
  versionHandler,
} from '../src/index.ts'

vi.mock('@deepseek-ai/dsh-tool-apppackage-publish', () => ({
  HttpPlatformClient: class HttpPlatformClient {
    readonly base: string
    readonly token: string
    readonly tenantId: string
    constructor(_base: string, _token: string, _tenantId: string) {
      this.base = _base
      this.token = _token
      this.tenantId = _tenantId
    }
  },
  publishPackage: vi.fn(async () => ({
    ok: true,
    apps: 1,
    entities: 1,
    fields: 2,
    funcs: 0,
    menus: 1,
    pages: 1,
  })),
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readFile: vi.fn(actual.readFile) }
})

const dirs: string[] = []

afterEach(async () => {
  vi.mocked(readFile).mockRestore()
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
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
  const dir = await mkdtemp(join(tmpdir(), 'uicp-preview-'))
  dirs.push(dir)
  await mkdir(join(dir, 'pages'))
  await mkdir(join(dir, 'entities'))
  await mkdir(join(dir, 'data'))
  await mkdir(join(dir, 'funcs'))
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

  it('walks up when the configured root is empty and falls back to cwd/app-packages at the filesystem root', () => {
    const previous = process.cwd()
    try {
      process.chdir(tmpdir())
      expect(resolveAppPackagesRoot({ appPackagesRoot: '' })).toBe(join(process.cwd(), 'app-packages'))
    } finally {
      process.chdir(previous)
    }
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

describe('editorWindowPage', () => {
  it('serves the standalone editor window with the preview bundle and mount call', async () => {
    const { res, captured } = fakeRes()
    editorWindowPage(res)
    expect(captured.statusCode).toBe(200)
    expect(captured.body).toContain('/uicp/preview/bundle.js')
    expect(captured.body).toContain('/uicp/preview/bundle.css')
    expect(captured.body).toContain('mountEurekaEditor')
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

  it('answers the page list with untitled and non-JSON page entries and a missing page id', async () => {
    const app = await packageDir()
    await writeFile(join(app, 'pages', 'untitled.json'), JSON.stringify({ type: 'page', body: [] }))
    await writeFile(join(app, 'pages', 'a.json'), JSON.stringify({ type: 'page', title: '最早', body: [] }))
    await writeFile(join(app, 'pages', 'z.json'), JSON.stringify({ type: 'page', title: '最晚', body: [] }))
    await writeFile(join(app, 'pages', 'notes.txt'), 'not a page')
    const missing = fakeRes()
    await pageHandler(fakeReq(`/uicp/preview/page?cwd=${encodeURIComponent(app)}&page=does-not-exist`), missing.res, app)
    expect(missing.captured.statusCode).toBe(404)
    const first = fakeRes()
    await pageHandler(fakeReq(`/uicp/preview/page?cwd=${encodeURIComponent(app)}`), first.res, app)
    expect(first.captured.statusCode).toBe(200)
    const pages = (JSON.parse(first.captured.body) as { data: { pages: { id: string; title: string }[] } }).data.pages
    expect(pages.find(page => page.id === 'untitled')?.title).toBe('untitled')
  })

  it('answers 400 when the request carries no url', async () => {
    const app = await packageDir()
    const noUrl = Object.assign(Readable.from([]), { method: 'GET', headers: {} }) as unknown as IncomingMessage
    const { res, captured } = fakeRes()
    await pageHandler(noUrl, res, join(app, '..'))
    expect(captured.statusCode).toBe(400)
  })

  it('registers its invariant companion under the package name', async () => {
    const registered: string[] = []
    const ctx = {
      invariants: {
        register: (pkg: string, installer: unknown) => {
          registered.push(pkg)
          expect(typeof installer).toBe('function')
          ;(installer as () => void)()
          return () => {}
        },
      },
    } as never
    await applyInvariant(ctx)
    expect(registered).toEqual(['@deepseek-ai/dsh-uicp-preview-backend'])
    expect(invariantName).toBe('uicp-preview-backend-invariant')
    expect(invariantInject).toEqual(['invariants'])
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

describe('testHandler', () => {
  it('runs the generated suite against the local sandbox and persists the cases', async () => {
    const app = await packageDir()
    const { res, captured } = fakeRes()
    await testHandler(fakePostReq('/uicp/preview/test', { cwd: app }), res, join(app, '..'))
    expect(captured.statusCode).toBe(200)
    const body = JSON.parse(captured.body) as {
      status: number
      data: { ok: boolean; cases: number; passed: number; failed: number }
    }
    expect(body.status).toBe(0)
    expect(body.data.cases).toBeGreaterThan(0)
    expect(body.data.passed).toBe(body.data.cases)
    expect(body.data.ok).toBe(true)
    const casesFile = join(app, 'tests', 'apppackage.cases.json')
    expect(JSON.parse(await readFile(casesFile, 'utf8'))).toBeInstanceOf(Array)
  })

  it('rejects GET, a bad cwd, and a non-object body', async () => {
    const app = await packageDir()
    const get = fakeRes()
    await testHandler(fakeReq('/uicp/preview/test'), get.res, join(app, '..'))
    expect(get.captured.statusCode).toBe(405)
    const badCwd = fakeRes()
    await testHandler(fakePostReq('/uicp/preview/test', { cwd: '/etc' }), badCwd.res, join(app, '..'))
    expect(badCwd.captured.statusCode).toBe(400)
    const badBody = fakeRes()
    await testHandler(fakePostReq('/uicp/preview/test', 'x'), badBody.res, join(app, '..'))
    expect(badBody.captured.statusCode).toBe(400)
  })
})

describe('versionHandler', () => {
  it('snapshots, lists, and restores the package files', async () => {
    const app = await packageDir()
    const snap = fakeRes()
    await versionHandler(fakePostReq('/uicp/preview/version', { cwd: app, action: 'snapshot' }), snap.res, join(app, '..'))
    expect(snap.captured.statusCode).toBe(200)
    const snapBody = JSON.parse(snap.captured.body) as { status: number; data: { version: string } }
    expect(snapBody.status).toBe(0)
    expect(snapBody.data.version).toBeTruthy()

    const list = fakeRes()
    await versionHandler(fakePostReq('/uicp/preview/version', { cwd: app, action: 'list' }), list.res, join(app, '..'))
    const listBody = JSON.parse(list.captured.body) as { data: { versions: string[] } }
    expect(listBody.data.versions).toEqual([snapBody.data.version])

    await writeFile(join(app, 'pages', 'order-list.json'), JSON.stringify({ type: 'page', title: '被改坏', body: [] }))
    const restore = fakeRes()
    await versionHandler(
      fakePostReq('/uicp/preview/version', { cwd: app, action: 'restore', version: snapBody.data.version }),
      restore.res,
      join(app, '..'),
    )
    const restoreBody = JSON.parse(restore.captured.body) as { data: { restored: number } }
    expect(restoreBody.data.restored).toBeGreaterThan(0)
    const page = JSON.parse(await readFile(join(app, 'pages', 'order-list.json'), 'utf8')) as { title: string }
    expect(page.title).toBe('订单管理')
  })

  it('rejects GET, unknown actions, and restore without a version', async () => {
    const app = await packageDir()
    const get = fakeRes()
    await versionHandler(fakeReq('/uicp/preview/version'), get.res, join(app, '..'))
    expect(get.captured.statusCode).toBe(405)
    const bad = fakeRes()
    await versionHandler(fakePostReq('/uicp/preview/version', { cwd: app, action: 'nope' }), bad.res, join(app, '..'))
    expect(bad.captured.statusCode).toBe(400)
    const noVersion = fakeRes()
    await versionHandler(fakePostReq('/uicp/preview/version', { cwd: app, action: 'restore' }), noVersion.res, join(app, '..'))
    expect(noVersion.captured.statusCode).toBe(400)
  })
})

describe('entityHandler', () => {
  it('serves CRUD against the workspace sandbox seeded with fixtures', async () => {
    const app = await packageDir()
    const list = fakeRes()
    await entityHandler(fakeReq(`/uicp/preview/entity/order/page?cwd=${encodeURIComponent(app)}`), list.res, join(app, '..'))
    const listBody = JSON.parse(list.captured.body) as { status: number; data: { total: number } }
    expect(listBody.status).toBe(0)
    expect(listBody.data.total).toBe(1)
    const insert = fakeRes()
    await entityHandler(
      fakePostReq(`/uicp/preview/entity/order?cwd=${encodeURIComponent(app)}`, { orderNo: 'SO-002', amount: 3 }),
      insert.res,
      join(app, '..'),
    )
    expect(JSON.parse(insert.captured.body) as { status: number }).toMatchObject({ status: 0 })
    const list2 = fakeRes()
    await entityHandler(fakeReq(`/uicp/preview/entity/order/page?cwd=${encodeURIComponent(app)}`), list2.res, join(app, '..'))
    expect((JSON.parse(list2.captured.body) as { data: { total: number } }).data.total).toBe(2)
  })

  it('rejects a cwd outside the root', async () => {
    const app = await packageDir()
    const bad = fakeRes()
    await entityHandler(fakeReq('/uicp/preview/entity/order/list?cwd=/etc'), bad.res, join(app, '..'))
    expect(bad.captured.statusCode).toBe(400)
  })
})

describe('publishHandler', () => {
  it('rejects GET, missing adoption, missing credentials, and a bad cwd', async () => {
    const app = await packageDir()
    const get = fakeRes()
    await publishHandler(fakeReq('/uicp/preview/publish'), get.res, join(app, '..'))
    expect(get.captured.statusCode).toBe(405)
    const noAdopt = fakeRes()
    await publishHandler(
      fakePostReq('/uicp/preview/publish', { cwd: app, baseUrl: 'x', token: 't', tenantId: 'id' }),
      noAdopt.res,
      join(app, '..'),
    )
    expect(noAdopt.captured.statusCode).toBe(400)
    expect((JSON.parse(noAdopt.captured.body) as { msg: string }).msg).toContain('未采纳')
    const noCreds = fakeRes()
    await publishHandler(fakePostReq('/uicp/preview/publish', { cwd: app, adopted: true }), noCreds.res, join(app, '..'))
    expect(noCreds.captured.statusCode).toBe(400)
    const badCwd = fakeRes()
    await publishHandler(
      fakePostReq('/uicp/preview/publish', { cwd: '/etc', adopted: true, baseUrl: 'x', token: 't', tenantId: 'id' }),
      badCwd.res,
      join(app, '..'),
    )
    expect(badCwd.captured.statusCode).toBe(400)
  })
})

describe('pageHandler edge cases', () => {
  it('answers 404 for unsafe page ids and 400 when cwd is missing', async () => {
    const app = await packageDir()
    const unsafe = fakeRes()
    await pageHandler(fakeReq(`/uicp/preview/page?cwd=${encodeURIComponent(app)}&page=a/b`), unsafe.res, join(app, '..'))
    expect(unsafe.captured.statusCode).toBe(404)
    const noCwd = fakeRes()
    await pageHandler(fakeReq('/uicp/preview/page'), noCwd.res, join(app, '..'))
    expect(noCwd.captured.statusCode).toBe(400)
  })

  it('answers 404 when the package has no pages directory or no page files', async () => {
    const app = await packageDir()
    await rm(join(app, 'pages'), { recursive: true })
    const none = fakeRes()
    await pageHandler(fakeReq(`/uicp/preview/page?cwd=${encodeURIComponent(app)}`), none.res, join(app, '..'))
    expect(none.captured.statusCode).toBe(404)
    expect(JSON.parse(none.captured.body) as { msg: string }).toMatchObject({ msg: 'the app-package directory has no pages yet' })
    await mkdir(join(app, 'pages'))
    await writeFile(join(app, 'pages', 'notes.txt'), 'not a page')
    const noJson = fakeRes()
    await pageHandler(fakeReq(`/uicp/preview/page?cwd=${encodeURIComponent(app)}`), noJson.res, join(app, '..'))
    expect(noJson.captured.statusCode).toBe(404)
  })

  it('answers 404 when the pages path is a file and 500 on malformed page JSON', async () => {
    const app = await packageDir()
    await rm(join(app, 'pages'), { recursive: true })
    await writeFile(join(app, 'pages'), 'file')
    const filePages = fakeRes()
    await pageHandler(fakeReq(`/uicp/preview/page?cwd=${encodeURIComponent(app)}&page=order-list`), filePages.res, join(app, '..'))
    expect(filePages.captured.statusCode).toBe(404)
    await rm(join(app, 'pages'))
    await mkdir(join(app, 'pages'))
    await writeFile(join(app, 'pages', 'broken.json'), '{ nope')
    const broken = fakeRes()
    await pageHandler(fakeReq(`/uicp/preview/page?cwd=${encodeURIComponent(app)}&page=broken`), broken.res, join(app, '..'))
    expect(broken.captured.statusCode).toBe(500)
  })

  it('skips fixtures without a data file and answers 500 on a malformed one', async () => {
    const app = await packageDir()
    await writeFile(join(app, 'pages', 'no-data.json'), JSON.stringify({
      type: 'page',
      title: '无数据',
      body: [{ type: 'crud', api: { method: 'get', url: '/app-package/entity/ghost/page' } }],
    }))
    const skipped = fakeRes()
    await pageHandler(fakeReq(`/uicp/preview/page?cwd=${encodeURIComponent(app)}&page=no-data`), skipped.res, join(app, '..'))
    expect(skipped.captured.statusCode).toBe(200)
    expect((JSON.parse(skipped.captured.body) as { data: { fixtures: Record<string, unknown[]> } }).data.fixtures).toEqual({})

    await writeFile(join(app, 'pages', 'ref.json'), JSON.stringify({
      type: 'page',
      title: '引用坏数据',
      body: [{ type: 'crud', api: { method: 'get', url: '/app-package/entity/bad/page' } }],
    }))
    await writeFile(join(app, 'data', 'bad.json'), '{ bad')
    const malformed = fakeRes()
    await pageHandler(fakeReq(`/uicp/preview/page?cwd=${encodeURIComponent(app)}&page=ref`), malformed.res, join(app, '..'))
    expect(malformed.captured.statusCode).toBe(500)
  })
})

describe('savePageHandler edge cases', () => {
  it('rejects a non-object body, a missing cwd, and a non-Error body rejection', async () => {
    const app = await packageDir()
    const nonObject = fakeRes()
    await savePageHandler(fakePostReq('/uicp/preview/page', 'x'), nonObject.res, join(app, '..'))
    expect(nonObject.captured.statusCode).toBe(400)
    const noCwd = fakeRes()
    await savePageHandler(fakePostReq('/uicp/preview/page', { page: 'order-list', value: { type: 'page' } }), noCwd.res, join(app, '..'))
    expect(noCwd.captured.statusCode).toBe(400)
    const errorReq = Object.assign(new EventEmitter(), {
      method: 'POST',
      url: '/uicp/preview/page',
      headers: {},
    }) as unknown as IncomingMessage
    const errorRes = fakeRes()
    const pending = savePageHandler(errorReq, errorRes.res, join(app, '..'))
    errorReq.emit('error', 'stream failure')
    await pending
    expect(errorRes.captured.statusCode).toBe(400)
  })

  it('reports a 500 when the page write fails', async () => {
    const app = await packageDir()
    await rm(join(app, 'pages'), { recursive: true })
    await writeFile(join(app, 'pages'), 'not a directory')
    const { res, captured } = fakeRes()
    await savePageHandler(
      fakePostReq('/uicp/preview/page', { cwd: app, page: 'order-list', value: { type: 'page', body: [] } }),
      res,
      join(app, '..'),
    )
    expect(captured.statusCode).toBe(500)
  })
})

describe('savePageHandler validation structure', () => {
  it('collects packages with missing top-level files, subdirectories, and non-JSON entries', async () => {
    const app = await packageDir()
    await rm(join(app, 'app.json'))
    await rm(join(app, 'entities'), { recursive: true })
    await rm(join(app, 'funcs'), { recursive: true })
    await writeFile(join(app, 'data', 'notes.txt'), 'x')
    const { res, captured } = fakeRes()
    await savePageHandler(
      fakePostReq('/uicp/preview/page', { cwd: app, page: 'order-list', value: { type: 'page', body: [] } }),
      res,
      join(app, '..'),
    )
    expect(captured.statusCode).toBe(200)
  })

  it('collects function files and skips non-directory entries in funcs', async () => {
    const app = await packageDir()
    await mkdir(join(app, 'funcs', 'order'))
    await writeFile(join(app, 'funcs', 'order', 'summary.js'), 'return { status: 0, data: {}, msg: "ok" }')
    await writeFile(join(app, 'funcs', 'order', 'summary.meta.json'), JSON.stringify({
      identifier: 'summary',
      name: '汇总',
      type: 'static',
    }))
    await writeFile(join(app, 'funcs', 'notes.txt'), 'x')
    const { res, captured } = fakeRes()
    await savePageHandler(
      fakePostReq('/uicp/preview/page', { cwd: app, page: 'order-list', value: { type: 'page', body: [] } }),
      res,
      join(app, '..'),
    )
    expect(captured.statusCode).toBe(200)
  })
})

describe('testHandler edge cases', () => {
  it('rejects a body without cwd and reports a 500 when the package cannot load', async () => {
    const app = await packageDir()
    const noCwd = fakeRes()
    await testHandler(fakePostReq('/uicp/preview/test', {}), noCwd.res, join(app, '..'))
    expect(noCwd.captured.statusCode).toBe(400)
    await rm(join(app, 'entities'), { recursive: true })
    await rm(join(app, 'funcs'), { recursive: true })
    const broken = fakeRes()
    await testHandler(fakePostReq('/uicp/preview/test', { cwd: app }), broken.res, join(app, '..'))
    expect(broken.captured.statusCode).toBe(500)
  })
})

describe('versionHandler edge cases', () => {
  it('rejects a non-object body and a body without cwd', async () => {
    const app = await packageDir()
    const nonObject = fakeRes()
    await versionHandler(fakePostReq('/uicp/preview/version', 'x'), nonObject.res, join(app, '..'))
    expect(nonObject.captured.statusCode).toBe(400)
    const noCwd = fakeRes()
    await versionHandler(fakePostReq('/uicp/preview/version', { action: 'list' }), noCwd.res, join(app, '..'))
    expect(noCwd.captured.statusCode).toBe(400)
  })

  it('lists an empty store, snapshots under an explicit name, excludes derived files, and 500s on a missing version', async () => {
    const app = await packageDir()
    const empty = fakeRes()
    await versionHandler(fakePostReq('/uicp/preview/version', { cwd: app, action: 'list' }), empty.res, join(app, '..'))
    expect((JSON.parse(empty.captured.body) as { data: { versions: string[] } }).data.versions).toEqual([])

    await mkdir(join(app, 'tests'))
    await writeFile(join(app, 'tests', 'x.txt'), 'x')
    await mkdir(join(app, 'data', 'order'))
    await writeFile(join(app, 'data', 'order', 'session.json'), '{}')

    const first = fakeRes()
    await versionHandler(fakePostReq('/uicp/preview/version', { cwd: app, action: 'snapshot', version: 'v1' }), first.res, join(app, '..'))
    expect((JSON.parse(first.captured.body) as { data: { version: string } }).data.version).toBe('v1')
    const second = fakeRes()
    await versionHandler(fakePostReq('/uicp/preview/version', { cwd: app, action: 'snapshot' }), second.res, join(app, '..'))
    expect((JSON.parse(second.captured.body) as { data: { version: string } }).data.version).not.toBe('v1')

    await writeFile(join(app, 'versions', 'v1.txt'), 'x')
    const list = fakeRes()
    await versionHandler(fakePostReq('/uicp/preview/version', { cwd: app, action: 'list' }), list.res, join(app, '..'))
    const versions = (JSON.parse(list.captured.body) as { data: { versions: string[] } }).data.versions
    expect(versions).toContain('v1')
    expect(versions).not.toContain('v1.txt')

    const missing = fakeRes()
    await versionHandler(fakePostReq('/uicp/preview/version', { cwd: app, action: 'restore', version: 'nope' }), missing.res, join(app, '..'))
    expect(missing.captured.statusCode).toBe(500)
  })
})

describe('entityHandler edge cases', () => {
  it('rejects missing cwd/url, folds query params, tolerates non-JSON bodies, and 500s when the package cannot load', async () => {
    const app = await packageDir()
    const noCwd = fakeRes()
    await entityHandler(fakeReq('/uicp/preview/entity/order/list'), noCwd.res, join(app, '..'))
    expect(noCwd.captured.statusCode).toBe(400)

    const noUrl = Object.assign(Readable.from([]), { method: 'GET', headers: {} }) as unknown as IncomingMessage
    const noUrlRes = fakeRes()
    await entityHandler(noUrl, noUrlRes.res, join(app, '..'))
    expect(noUrlRes.captured.statusCode).toBe(400)

    const single = fakeRes()
    await entityHandler(
      fakeReq(`/uicp/preview/entity/order/page?cwd=${encodeURIComponent(app)}&_sort=amount`),
      single.res,
      join(app, '..'),
    )
    expect(single.captured.statusCode).toBe(200)
    const multi = fakeRes()
    await entityHandler(
      fakeReq(`/uicp/preview/entity/order/page?cwd=${encodeURIComponent(app)}&_sort=amount&_sort=orderNo`),
      multi.res,
      join(app, '..'),
    )
    expect(multi.captured.statusCode).toBe(200)

    const bare = Object.assign(Readable.from([]), {
      url: `/uicp/preview/entity/order/list?cwd=${encodeURIComponent(app)}`,
      headers: {},
    }) as unknown as IncomingMessage
    const bareRes = fakeRes()
    await entityHandler(bare, bareRes.res, join(app, '..'))
    expect(bareRes.captured.statusCode).toBe(200)

    const badJson = Object.assign(Readable.from(['not json']), {
      method: 'POST',
      url: `/uicp/preview/entity/order?cwd=${encodeURIComponent(app)}`,
      headers: {},
    }) as unknown as IncomingMessage
    const badJsonRes = fakeRes()
    await entityHandler(badJson, badJsonRes.res, join(app, '..'))
    expect(badJsonRes.captured.statusCode).toBe(400)

    const brokenApp = await packageDir()
    await rm(join(brokenApp, 'entities'), { recursive: true })
    await rm(join(brokenApp, 'funcs'), { recursive: true })
    const broken = fakeRes()
    await entityHandler(fakeReq(`/uicp/preview/entity/order/list?cwd=${encodeURIComponent(brokenApp)}`), broken.res, join(brokenApp, '..'))
    expect(broken.captured.statusCode).toBe(500)
  })
})

describe('publishHandler after adoption', () => {
  it('rejects a non-object body, a body without cwd, and empty credentials', async () => {
    const app = await packageDir()
    const nonObject = fakeRes()
    await publishHandler(fakePostReq('/uicp/preview/publish', 'x'), nonObject.res, join(app, '..'))
    expect(nonObject.captured.statusCode).toBe(400)
    const noCwd = fakeRes()
    await publishHandler(fakePostReq('/uicp/preview/publish', { adopted: true, token: 't', tenantId: 'id' }), noCwd.res, join(app, '..'))
    expect(noCwd.captured.statusCode).toBe(400)
    const emptyToken = fakeRes()
    await publishHandler(fakePostReq('/uicp/preview/publish', { cwd: app, adopted: true, token: '', tenantId: 'id' }), emptyToken.res, join(app, '..'))
    expect(emptyToken.captured.statusCode).toBe(400)
    const emptyTenant = fakeRes()
    await publishHandler(fakePostReq('/uicp/preview/publish', { cwd: app, adopted: true, token: 't', tenantId: '' }), emptyTenant.res, join(app, '..'))
    expect(emptyTenant.captured.statusCode).toBe(400)
  })

  it('publishes the package and reports platform failures as 500', async () => {
    const app = await packageDir()
    const ok = fakeRes()
    await publishHandler(
      fakePostReq('/uicp/preview/publish', { cwd: app, adopted: true, token: 't', tenantId: 'id' }),
      ok.res,
      join(app, '..'),
      'http://platform.test',
    )
    expect(ok.captured.statusCode).toBe(200)
    expect((JSON.parse(ok.captured.body) as { status: number; data: { ok: boolean } }).data.ok).toBe(true)
    expect(vi.mocked(publishPackage)).toHaveBeenCalled()

    vi.mocked(publishPackage).mockRejectedValueOnce(new Error('platform refused'))
    const failed = fakeRes()
    await publishHandler(
      fakePostReq('/uicp/preview/publish', { cwd: app, adopted: true, token: 't', tenantId: 'id' }),
      failed.res,
      join(app, '..'),
      'http://platform.test',
    )
    expect(failed.captured.statusCode).toBe(500)
  })
})

describe('apply route registration', () => {
  it('defaults the publish platform base when the config omits it', async () => {
    const app = await packageDir()
    const ctx = new Context()
    const registrations: Array<{ path: string; handler: (req: IncomingMessage, res: ServerResponse) => void }> = []
    ctx.provide('webServer', {
      register: (registration: unknown) => {
        registrations.push(registration as typeof registrations[number])
        return () => {}
      },
    } as never)
    apply(ctx, { appPackagesRoot: app })
    const publish = registrations.find(entry => entry.path === '/uicp/preview/publish')!
    const { res, captured } = fakeRes()
    publish.handler(fakePostReq('/uicp/preview/publish', { cwd: app, adopted: true, token: 't', tenantId: 'id' }), res)
    await vi.waitFor(() => { expect(captured.statusCode).not.toBe(0) })
    expect(captured.statusCode).toBe(200)
    await ctx.fiber.dispose()
  })

  it('registers every preview route, serves each through the fake webserver, and disposes cleanly', async () => {
    const app = await packageDir()
    const ctx = new Context()
    const registrations: Array<{
      kind: string
      path: string
      handler: (req: IncomingMessage, res: ServerResponse) => void
    }> = []
    const disposers: Array<ReturnType<typeof vi.fn>> = []
    ctx.provide('webServer', {
      register: (registration: unknown) => {
        registrations.push(registration as typeof registrations[number])
        const disposer = vi.fn()
        disposers.push(disposer)
        return disposer
      },
    } as never)
    apply(ctx, { appPackagesRoot: app, platformBase: 'http://platform.test' })

    expect(registrations.map(({ kind, path }) => `${kind} ${path}`)).toEqual([
      'exact /uicp/editor',
      'exact /uicp/preview/root',
      'exact /uicp/preview/bundle.js',
      'exact /uicp/preview/bundle.css',
      'exact /uicp/preview/page',
      'exact /uicp/preview/test',
      'exact /uicp/preview/version',
      'prefix /uicp/preview/entity',
      'exact /uicp/preview/publish',
    ])

    async function serve(path: string, req: IncomingMessage): Promise<{ statusCode: number; body: string }> {
      const registration = registrations.find(entry => entry.path === path)!
      const { res, captured } = fakeRes()
      registration.handler(req, res)
      // Route arrows fire their async handlers through `void`, so settle on the response write.
      await vi.waitFor(() => { expect(captured.statusCode).not.toBe(0) })
      return captured
    }

    expect((await serve('/uicp/editor', fakeReq('/uicp/editor'))).statusCode).toBe(200)
    const root = await serve('/uicp/preview/root', fakeReq('/uicp/preview/root'))
    expect(JSON.parse(root.body)).toEqual({ status: 0, data: { root: app } })
    expect((await serve('/uicp/preview/bundle.js', fakeReq('/uicp/preview/bundle.js'))).statusCode).toBe(200)
    expect((await serve('/uicp/preview/bundle.css', fakeReq('/uicp/preview/bundle.css'))).statusCode).toBe(200)
    const pageGet = await serve('/uicp/preview/page', fakeReq(`/uicp/preview/page?cwd=${encodeURIComponent(app)}&page=order-list`))
    expect(pageGet.statusCode).toBe(200)
    const pagePost = await serve('/uicp/preview/page', fakePostReq('/uicp/preview/page', {
      cwd: app,
      page: 'order-list',
      value: { type: 'page', title: '路由页', body: [] },
    }))
    expect((JSON.parse(pagePost.body) as { status: number; data: { ok: boolean } }).data.ok).toBe(true)
    const test = await serve('/uicp/preview/test', fakePostReq('/uicp/preview/test', { cwd: app }))
    expect((JSON.parse(test.body) as { status: number }).status).toBe(0)
    const version = await serve('/uicp/preview/version', fakePostReq('/uicp/preview/version', { cwd: app, action: 'list' }))
    expect((JSON.parse(version.body) as { status: number }).status).toBe(0)
    const entity = await serve('/uicp/preview/entity', fakeReq(`/uicp/preview/entity/order/page?cwd=${encodeURIComponent(app)}`))
    expect((JSON.parse(entity.body) as { status: number }).status).toBe(0)
    const publish = await serve('/uicp/preview/publish', fakePostReq('/uicp/preview/publish', {
      cwd: app,
      adopted: true,
      token: 't',
      tenantId: 'id',
    }))
    expect((JSON.parse(publish.body) as { status: number }).status).toBe(0)

    // A missing preview asset answers 404 through the bundle route.
    vi.mocked(readFile).mockRejectedValueOnce(new Error('missing'))
    const missingAsset = await serve('/uicp/preview/bundle.css', fakeReq('/uicp/preview/bundle.css'))
    expect(missingAsset.statusCode).toBe(404)

    await ctx.fiber.dispose()
    expect(disposers.length).toBe(9)
    expect(disposers.every(disposer => disposer.mock.calls.length === 1)).toBe(true)
  })
})
