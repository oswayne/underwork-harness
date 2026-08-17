import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import {
  apply as applyInvariant, inject as invariantInject, name as invariantName,
} from '../src/invariant.ts'
import {
  pageHandler, resolveAppPackagesRoot, resolvePackageDir,
} from '../src/index.ts'

let dir: string | undefined

afterEach(async () => {
  if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  dir = undefined
})

function fakeReq(url: string): never {
  return Object.assign(Readable.from([]), { method: 'GET', url, headers: {} }) as never
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
  await mkdir(join(dir, 'data'))
  await writeFile(join(dir, 'pages', 'order-list.json'), JSON.stringify({
    type: 'page',
    title: '订单管理',
    body: [{ type: 'crud', api: { method: 'get', url: '/app-package/entity/order/page' } }],
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
    await pageHandler(fakeReq(`/uicp/preview/page?cwd=${encodeURIComponent(app)}`), res, join(app, '..'))
    expect(captured.statusCode).toBe(200)
    const body = JSON.parse(captured.body) as {
      status: number
      data: { schema: { type: string }; fixtures: Record<string, unknown[]> }
    }
    expect(body.status).toBe(0)
    expect(body.data.schema.type).toBe('page')
    expect(body.data.fixtures.order).toHaveLength(1)
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
