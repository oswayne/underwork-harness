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

/** localStorage key owned by the ui-uicp-nav auth store (same origin). */
const TOKEN_KEY = 'uicp.platform.token'

/**
 * Preview seam headers: the platform JWT plus any caller extras. The remote
 * seam rejects anonymous requests, so every preview call carries the token.
 * @param extra - additional headers (e.g. the JSON content type).
 * @returns the merged header record.
 */
export function previewHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = { ...(extra as Record<string, string> | undefined) }
  try {
    const token = window.localStorage.getItem(TOKEN_KEY)
    if (token !== null && token !== '') headers.Authorization = `Bearer ${token}`
  } catch {
    // Storage unavailable: the preview seam answers 401 and the UI falls back to sign-in.
  }
  return headers
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
      init.headers = previewHeaders({ 'content-type': 'application/json' })
      init.body = JSON.stringify(request.data)
    } else {
      init.headers = previewHeaders()
    }
    return fetch(`${target.pathname}${target.search}`, init).then(response => response.json() as Promise<PreviewResponse>)
  }
}
