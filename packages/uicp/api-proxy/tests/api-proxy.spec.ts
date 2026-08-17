import { describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { ServerResponse } from 'node:http'
import { apply as applyInvariant, inject as invariantInject, name as invariantName } from '../src/invariant.ts'
import { apply, routeHandler } from '../src/index.ts'

function fakeReq(method: string, url: string, headers: Record<string, string>, body?: string) {
  return Object.assign(
    body === undefined ? Readable.from([]) : Readable.from([body]),
    { method, url, headers },
  ) as never
}

function fakeRes(): { res: ServerResponse; captured: { statusCode: number; body: string } } {
  const captured = { statusCode: 0, body: '' }
  const res = {
    writeHead: (statusCode: number) => { captured.statusCode = statusCode },
    end: (body: string) => { captured.body = body },
  } as unknown as ServerResponse
  return { res, captured }
}

describe('routeHandler', () => {
  it('forwards GET with auth headers and echoes the response', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ data: [{ _id: 't1' }] }), { status: 200 })
    }))
    const { res, captured } = fakeRes()
    await routeHandler(
      fakeReq('GET', '/uicp-api/systemctl/tenant/list', { authorization: 'jwt', tenant: 't1' }),
      res,
      'https://api.underwork.cn/uicp',
    )
    expect(calls[0]!.url).toBe('https://api.underwork.cn/uicp/systemctl/tenant/list')
    expect(calls[0]!.init.headers).toMatchObject({ authorization: 'jwt', tenant: 't1' })
    expect(captured.statusCode).toBe(200)
    expect((JSON.parse(captured.body) as { data: { _id: string }[] }).data).toEqual([{ _id: 't1' }])
    vi.unstubAllGlobals()
  })

  it('forwards POST bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"status":0}', { status: 200 })))
    const { res, captured } = fakeRes()
    await routeHandler(
      fakeReq('POST', '/uicp-api/app-package/entity', { 'content-type': 'application/json' }, '{"name":"x"}'),
      res,
      'https://api.underwork.cn/uicp',
    )
    expect(captured.statusCode).toBe(200)
    expect((JSON.parse(captured.body) as { status: number }).status).toBe(0)
    vi.unstubAllGlobals()
  })

  it('reports upstream failures as 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const { res, captured } = fakeRes()
    await routeHandler(fakeReq('GET', '/uicp-api/x', {}), res, 'https://api.underwork.cn/uicp')
    expect(captured.statusCode).toBe(502)
    expect((JSON.parse(captured.body) as { msg: string }).msg).toContain('network down')
    vi.unstubAllGlobals()
  })

  it('skips body forwarding for HEAD', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":1}', { status: 200 })))
    const { res, captured } = fakeRes()
    await routeHandler(
      fakeReq('HEAD', '/uicp-api/x', {}),
      res,
      'https://api.underwork.cn/uicp',
    )
    expect(captured.statusCode).toBe(200)
    vi.unstubAllGlobals()
  })

  it('accepts a missing method and Buffer chunks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":1}', { status: 200 })))
    const { res, captured } = fakeRes()
    await routeHandler(
      Object.assign(Readable.from([Buffer.from([1, 2])]), { headers: {} }) as never,
      res,
      'https://api.underwork.cn/uicp',
    )
    expect(captured.statusCode).toBe(200)
    vi.unstubAllGlobals()
  })

  it('defaults a missing url, forwards Uint8Array bodies, and maps non-Error failures to 502', async () => {
    const fetchMock = vi.fn(async () => { throw 'string boom' })
    vi.stubGlobal('fetch', fetchMock)
    const { res, captured } = fakeRes()
    await routeHandler(
      Object.assign(Readable.from([new Uint8Array([1, 2])]), { method: 'POST', headers: {} }) as never,
      res,
      'https://api.underwork.cn/uicp',
    )
    expect(fetchMock).toHaveBeenCalledWith('https://api.underwork.cn/uicp/', expect.anything())
    expect(captured.statusCode).toBe(502)
    expect((JSON.parse(captured.body) as { msg: string }).msg).toContain('string boom')
    vi.unstubAllGlobals()
  })
})

describe('apply', () => {
  it('registers the prefix route and rejects an empty upstream', async () => {
    const registered = vi.fn()
    const ctx = {
      webServer: { register: (route: unknown) => { registered(route); return () => {} } },
      effect: (fn: () => unknown) => { fn() },
    } as never
    expect(() => { apply(ctx, { upstream: '' }) }).toThrow('upstream is required')
    apply(ctx, { upstream: 'https://api.underwork.cn/uicp' })
    const route = registered.mock.calls[0]![0] as {
      kind: string
      path: string
      handler: (req: never, res: ServerResponse) => Promise<void>
    }
    expect(route).toMatchObject({ kind: 'prefix', path: '/uicp-api' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"data":[]}', { status: 200 })))
    const { res, captured } = fakeRes()
    await route.handler(
      fakeReq('GET', '/uicp-api/systemctl/tenant/list', { authorization: 'jwt' }),
      res,
    )
    expect(captured.statusCode).toBe(200)
    vi.unstubAllGlobals()
  })
})

describe('invariant companion', () => {
  it('registers with the invariant service', async () => {
    const registered: string[] = []
    const ctx = {
      invariants: {
        register: (pkg: string, installer: (ctx: unknown, fail: (message: string) => never) => void) => {
          registered.push(pkg)
          installer(null, (message) => { throw new Error(message) })
          return () => {}
        },
      },
    } as never
    const disposer = await applyInvariant(ctx)
    expect(registered).toEqual(['@deepseek-ai/dsh-uicp-api-proxy'])
    expect(invariantInject).toEqual(['invariants'])
    expect(invariantName).toBeTruthy()
    disposer()
  })
})
