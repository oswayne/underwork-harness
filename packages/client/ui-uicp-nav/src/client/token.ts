/**
 * Platform token access for the M0 shell: preferred storage is the Tauri
 * shell command (keychain later); in-memory fallback keeps the web UI usable
 * in a plain browser during development. The token never lands in
 * localStorage/sessionStorage.
 */
declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
      }
    }
    __UICP_API_BASE__?: string
  }
}

let memoryToken: string | undefined

export async function getToken(): Promise<string | undefined> {
  const core = window.__TAURI__?.core
  if (core !== undefined) {
    const stored = await core.invoke('get_token')
    if (typeof stored === 'string' && stored !== '') return stored
  }
  return memoryToken
}

export async function setToken(token: string): Promise<void> {
  const core = window.__TAURI__?.core
  if (core !== undefined) await core.invoke('set_token', { token })
  memoryToken = token
}

export async function clearToken(): Promise<void> {
  const core = window.__TAURI__?.core
  if (core !== undefined) await core.invoke('clear_token')
  memoryToken = undefined
}

/**
 * Platform API base. In the browser (shell / `dsh web`) the page is served
 * from the local host, so platform calls go through the same-origin
 * `/uicp-api` proxy; elsewhere (tests/scripts) fall back to the direct URL.
 */
export const API_BASE = typeof window === 'undefined'
  ? 'https://api.underwork.cn/uicp'
  : window.__UICP_API_BASE__ ?? '/uicp-api'
