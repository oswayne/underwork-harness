import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PlatformClient, PlatformRecord } from '../src/client.ts'
import { HttpPlatformClient } from '../src/client.ts'
import { publishPackage } from '../src/publish.ts'
import { apply, renderResult } from '../src/index.ts'

function memoryClient(): PlatformClient & {
  apps: PlatformRecord[]
  entities: PlatformRecord[]
  fields: PlatformRecord[]
  funcs: PlatformRecord[]
  menus: PlatformRecord[]
  pages: Map<string, unknown>
} {
  const apps: PlatformRecord[] = []
  const entities: PlatformRecord[] = []
  const fields: PlatformRecord[] = []
  const funcs: PlatformRecord[] = []
  const menus: PlatformRecord[] = []
  const pages = new Map<string, unknown>()
  let seq = 0
  const next = (): string => `id-${seq += 1}`
  return {
    apps, entities, fields, funcs, menus, pages,
    listApps: async () => apps,
    createApp: async (body) => { const record = { ...body, _id: next() } as PlatformRecord; apps.push(record); return record._id },
    listEntities: async () => entities,
    createEntity: async (body) => { const record = { ...body, _id: next() } as PlatformRecord; entities.push(record); return record._id },
    listFields: async () => fields,
    createField: async (body) => { fields.push(body as PlatformRecord) },
    listFuncs: async () => funcs,
    createFunc: async (body) => { funcs.push(body as PlatformRecord) },
    listMenus: async () => menus,
    createMenu: async (body) => { const record = { ...body, _id: next() } as PlatformRecord; menus.push(record); return record._id },
    getPage: async menuId => (pages.get(menuId) as Record<string, unknown> | undefined) ?? null,
    createPage: async (menuId, schema) => { pages.set(menuId, schema) },
  }
}

describe('publishPackage', () => {
  it('upserts app, entity, fields, funcs, menu, and page idempotently', async () => {
    const client = memoryClient()
    const first = await publishPackage('app-packages/cszh/dsh-test', client)
    expect(first.created).toMatchObject({ app: true, entities: 1, fields: 5, funcs: 2, menu: true, page: true })
    expect(client.pages.size).toBe(1)

    const second = await publishPackage('app-packages/cszh/dsh-test', client)
    expect(second.created).toMatchObject({ app: false, entities: 0, fields: 0, funcs: 0, menu: false, page: false })
    expect(client.apps).toHaveLength(1)
    expect(client.entities).toHaveLength(1)
    expect(client.fields).toHaveLength(5)
    expect(client.funcs).toHaveLength(2)
    expect(client.menus).toHaveLength(1)
    expect(client.pages.size).toBe(1)
  })
})

describe('HttpPlatformClient', () => {
  it('performs requests with auth headers and parses ids', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      if (url.endsWith('/app-package/list')) {
        return { ok: true, json: async () => ({ data: [] }) }
      }
      return { ok: true, json: async () => ({ data: { _id: 'abc' } }) }
    }))
    const client = new HttpPlatformClient('https://x', 'jwt', 'tenant')
    expect(await client.listApps()).toEqual([])
    expect(await client.createApp({ name: 'a' })).toBe('abc')
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: 'jwt', Tenant: 'tenant' })
    expect(calls[1]!.init.method).toBe('POST')
    expect(calls[1]!.init.body).toBe(JSON.stringify({ name: 'a' }))
    vi.unstubAllGlobals()
  })

  it('reports non-ok responses and missing ids', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))
    const client = new HttpPlatformClient('https://x', 'jwt', 'tenant')
    await expect(client.listApps()).rejects.toThrow('500')
    vi.unstubAllGlobals()

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: {} }) })))
    await expect(client.createApp({})).rejects.toThrow('缺少 _id')
    vi.unstubAllGlobals()
  })

  it('handles data-less lists and real page lookups', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/page')) {
        return { ok: true, json: async () => ({ data: { type: 'page', title: '订单管理' } }) }
      }
      return { ok: true, json: async () => ({}) }
    }))
    const client = new HttpPlatformClient('https://x', 'jwt', 'tenant')
    expect(await client.listApps()).toEqual([])
    expect(await client.getPage('m1')).toMatchObject({ type: 'page', title: '订单管理' })
    vi.unstubAllGlobals()
  })
})

describe('index', () => {
  it('renders the summary and requires adoption', async () => {
    const text = renderResult({
      ok: true,
      appId: 'app-1',
      created: { app: true, entities: 1, fields: 2, funcs: 1, menu: true, page: true },
    })[0]!.text
    expect(text).toContain('app-1')
    expect(text).toContain('fields=2')
    expect(renderResult({ ok: false, appId: 'x', created: { app: false, entities: 0, fields: 0, funcs: 0, menu: false, page: false } })[0]!.text).toContain('FAIL')

    const registered = vi.fn()
    const ctx = { tools: { register: (definition: unknown) => { registered(definition); return definition } } } as never
    apply(ctx)
    const definition = registered.mock.calls[0]![0] as {
      execute: (args: { directory: string; baseUrl: string; token: string; tenantId: string; adopted: boolean }) => Promise<unknown>
      output: { render: (args: unknown, value: unknown) => unknown }
    }
    await expect(definition.execute({ directory: '/x', baseUrl: 'b', token: 't', tenantId: 'i', adopted: false })).rejects.toThrow('未采纳')
    const client = memoryClient()
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const path = url.replace('https://b', '')
      const method = init?.method ?? 'GET'
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as unknown as Record<string, unknown>
        : {}
      if (method === 'GET' && path === '/app-package/list') return { ok: true, json: async () => ({ data: client.apps }) }
      if (method === 'GET' && path.startsWith('/app-package/entity/list')) return { ok: true, json: async () => ({ data: client.entities }) }
      if (method === 'GET' && path.startsWith('/app-package/entity/field/list')) return { ok: true, json: async () => ({ data: client.fields }) }
      if (method === 'GET' && path.startsWith('/app-package/entity/func/list')) return { ok: true, json: async () => ({ data: client.funcs }) }
      if (method === 'GET' && path.startsWith('/app-package/menu/list')) return { ok: true, json: async () => ({ data: client.menus }) }
      if (method === 'GET' && path.includes('/page')) return { ok: true, json: async () => ({ data: { type: 'page', title: '未配置' } }) }
      if (method === 'POST' && path === '/app-package') return { ok: true, json: async () => ({ data: { _id: await client.createApp(body) } }) }
      if (method === 'POST' && path === '/app-package/entity') return { ok: true, json: async () => ({ data: { _id: await client.createEntity(body) } }) }
      if (method === 'POST' && path === '/app-package/entity/field') { await client.createField(body); return { ok: true, json: async () => ({}) } }
      if (method === 'POST' && path === '/app-package/entity/func') { await client.createFunc(body); return { ok: true, json: async () => ({}) } }
      if (method === 'POST' && path === '/app-package/menu') return { ok: true, json: async () => ({ data: { _id: await client.createMenu(body) } }) }
      if (method === 'POST' && path.includes('/page')) { await client.createPage('menu-x', body); return { ok: true, json: async () => ({}) } }
      throw new Error(`unhandled ${method} ${path}`)
    }))
    const result = await definition.execute({ directory: 'app-packages/cszh/dsh-test', baseUrl: 'https://b', token: 't', tenantId: 'i', adopted: true }) as { ok: boolean }
    expect(result.ok).toBe(true)
    definition.output.render({ directory: '/x' }, {
      ok: true,
      appId: 'app-1',
      created: { app: false, entities: 0, fields: 0, funcs: 0, menu: false, page: false },
    })
    vi.unstubAllGlobals()
  })

  it('publishes a minimal package without funcs or pages', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'uicp-publish-'))
    try {
      mkdirSync(join(dir, 'entities'), { recursive: true })
      mkdirSync(join(dir, 'funcs', 'a'), { recursive: true })
      writeFileSync(join(dir, 'app.json'), JSON.stringify({ name: 'm', identifier: 'minimal' }))
      writeFileSync(join(dir, 'tenant.json'), JSON.stringify({ identifier: 't' }))
      writeFileSync(join(dir, 'menus.json'), '[]')
      writeFileSync(join(dir, 'entities', 'a.json'), JSON.stringify({ identifier: 'a', fields: [] }))
      const client = memoryClient()
      const summary = await publishPackage(dir, client)
      expect(summary.created).toMatchObject({ app: true, entities: 1, fields: 0, funcs: 0, menu: true, page: false })
      expect(client.menus[0]).toBeTruthy()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
