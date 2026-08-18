/**
 * Sandbox-backed eureka fetcher for the M3 preview: forwards the page's
 * `/app-package/entity/...` reads and writes to the workspace sandbox seam
 * (`/uicp/preview/entity/...`) scoped to the current package, and mocks
 * uploads. CRUD edits persist in the in-process sandbox store.
 */

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
 * Build a preview fetcher proxying the package's data reads and writes to the
 * workspace sandbox seam.
 * @param cwd - app-package directory of the current session.
 * @returns a fetcher answering eureka requests against the local sandbox.
 */
export function makeSandboxFetcher(cwd: string): (request: PreviewRequest) => Promise<PreviewResponse> {
  return (request) => {
    const url = new URL(request.url, 'http://localhost')
    if (/upload/i.test(url.pathname)) {
      return Promise.resolve({ status: 0, data: { url: `mock://upload/${Date.now()}` }, msg: null })
    }
    if (!url.pathname.startsWith('/app-package/entity/')) {
      return Promise.resolve({ status: 0, data: {}, msg: null })
    }
    const target = new URL(url.pathname.replace(/^\/app-package/, '/uicp/preview'), 'http://localhost')
    for (const [key, value] of url.searchParams) target.searchParams.append(key, value)
    target.searchParams.set('cwd', cwd)
    const init: RequestInit = { method: request.method }
    if (request.data !== undefined) {
      init.headers = { 'content-type': 'application/json' }
      init.body = JSON.stringify(request.data)
    }
    return fetch(`${target.pathname}${target.search}`, init).then(response => response.json() as Promise<PreviewResponse>)
  }
}
