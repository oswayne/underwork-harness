// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { makeFixtureFetcher } from '../src/client/fixture-fetcher.ts'

describe('makeFixtureFetcher', () => {
  it('answers page/list reads from the fixture snapshot', async () => {
    const fetcher = makeFixtureFetcher({ order: [{ orderNo: 'SO-001' }] })
    const page = await fetcher({ url: '/app-package/entity/order/page', method: 'GET' })
    expect(page).toEqual({
      status: 0,
      data: { items: [{ orderNo: 'SO-001' }], total: 1, page: 1 },
      msg: null,
    })
    const list = await fetcher({ url: '/app-package/entity/order/list', method: 'GET' })
    expect((list.data as { items: unknown[] }).items).toHaveLength(1)
  })

  it('mocks uploads and answers unknown paths with an empty success', async () => {
    const fetcher = makeFixtureFetcher({})
    const upload = await fetcher({ url: '/app-package/upload', method: 'POST', data: {} })
    expect((upload.data as { url: string }).url).toMatch(/^mock:\/\/upload\//)
    const other = await fetcher({ url: '/app-package/entity/order/stats', method: 'GET' })
    expect(other).toEqual({ status: 0, data: {}, msg: null })
  })
})
