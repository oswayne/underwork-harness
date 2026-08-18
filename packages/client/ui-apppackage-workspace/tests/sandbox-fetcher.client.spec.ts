// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeSandboxFetcher } from '../src/client/sandbox-fetcher.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('makeSandboxFetcher', () => {
  it('forwards entity reads to the workspace sandbox seam with cwd and query', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response(JSON.stringify({
      status: 0,
      data: { items: [], total: 0, page: 1 },
      msg: null,
    })))
    vi.stubGlobal('fetch', fetchMock)
    const fetcher = makeSandboxFetcher('/root/cszh/sre-w')
    const page = await fetcher({ url: '/app-package/entity/sre-work-work-order/page?status!==待分配', method: 'GET' })
    expect(page.status).toBe(0)
    const call = fetchMock.mock.calls[0]
    const url = new URL(String(call?.[0]), 'http://localhost')
    expect(url.pathname).toBe('/uicp/preview/entity/sre-work-work-order/page')
    expect(url.searchParams.get('cwd')).toBe('/root/cszh/sre-w')
    expect(url.searchParams.has('status!')).toBe(true)
    expect(call?.[1]?.method).toBe('GET')
  })

  it('posts JSON bodies for writes', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response(JSON.stringify({
      status: 0,
      data: { _id: '1' },
      msg: null,
    })))
    vi.stubGlobal('fetch', fetchMock)
    const fetcher = makeSandboxFetcher('/root/cszh/sre-w')
    await fetcher({ url: '/app-package/entity/sre-work-work-order', method: 'POST', data: { work_no: 'X' } })
    const call = fetchMock.mock.calls[0]
    expect(call?.[1]?.body).toBe(JSON.stringify({ work_no: 'X' }))
    expect((call?.[1]?.headers as Record<string, string> | undefined)?.['content-type']).toBe('application/json')
  })

  it('mocks uploads and answers non-entity paths without a network call', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const fetcher = makeSandboxFetcher('/root/cszh/sre-w')
    const upload = await fetcher({ url: '/app-package/upload', method: 'POST', data: {} })
    expect((upload.data as { url: string }).url).toMatch(/^mock:\/\/upload\//)
    const other = await fetcher({ url: '/lowcode/form/schema/order', method: 'GET' })
    expect(other).toEqual({ status: 0, data: {}, msg: null })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
