/**
 * Fixture-backed eureka fetcher for the M2 preview: answers the page's
 * `/app-package/entity/<id>/page|list` reads from the fixture arrays and
 * mocks uploads. The real sandbox data path lands in M3.
 */

/** Fixture record arrays keyed by entity identifier. */
export type PreviewFixtures = Record<string, readonly Record<string, unknown>[]>

/** Platform-shaped response (`status` 0 = success). */
export interface PreviewResponse {
  status: number
  data: unknown
  msg: string | null
}

/** The eureka fetcher request contract (URL + method + optional body). */
export interface PreviewRequest {
  url: string
  method: string
  data?: unknown
}

/**
 * Build a preview fetcher over one fixture snapshot.
 * @param fixtures - fixture arrays keyed by entity identifier.
 * @returns a fetcher answering eureka reads and upload mocks.
 */
export function makeFixtureFetcher(
  fixtures: PreviewFixtures,
): (request: PreviewRequest) => Promise<PreviewResponse> {
  return (request) => {
    const url = new URL(request.url, 'http://localhost')
    const read = url.pathname.match(/^\/app-package\/entity\/([a-z0-9][a-z0-9-]*)\/(page|list)$/)
    if (read !== null) {
      const entity = read[1]
      if (entity === undefined) return Promise.resolve({ status: 0, data: {}, msg: null })
      const items = [...(fixtures[entity] ?? [])]
      return Promise.resolve({ status: 0, data: { items, total: items.length, page: 1 }, msg: null })
    }
    if (/upload/i.test(url.pathname)) {
      return Promise.resolve({ status: 0, data: { url: `mock://upload/${Date.now()}` }, msg: null })
    }
    return Promise.resolve({ status: 0, data: {}, msg: null })
  }
}
