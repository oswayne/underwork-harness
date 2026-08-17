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

/** Auth listeners run on every effective-token change (sign-in/logout). */
type AuthListener = () => void

/** Effective token as known by the UI layer (bridged or in-memory). */
let currentToken: string | undefined
const authListeners = new Set<AuthListener>()

/**
 * Subscribe to effective-token changes. Returns the unsubscribe function.
 * @param listener - called whenever the effective token changes.
 */
export function subscribeAuth(listener: AuthListener): () => void {
  authListeners.add(listener)
  return () => {
    authListeners.delete(listener)
  }
}

/** Synchronous snapshot of the effective token for useSyncExternalStore. */
export function authSnapshot(): string | undefined {
  return currentToken
}

function setCurrentToken(token: string | undefined): void {
  if (currentToken === token) return
  currentToken = token
  for (const listener of authListeners) listener()
}

/** Resolve the stored token into the auth store (idempotent, fire-and-forget). */
export function refreshAuth(): void {
  void getToken().then(setCurrentToken)
}

/** Test hook: reset the auth store between tests. */
export function resetAuth(): void {
  currentToken = undefined
}

export async function getToken(): Promise<string | undefined> {
  const core = window.__TAURI__?.core
  if (core !== undefined) {
    try {
      const stored = await core.invoke('get_token')
      if (typeof stored === 'string' && stored !== '') return stored
    } catch (error) {
      // Shell command not permitted (M0 capability gap): fall through to the
      // in-memory token so the browser flow stays usable.
      console.error('uicp-nav: get_token failed', error)
    }
  }
  return memoryToken
}

export async function setToken(token: string): Promise<void> {
  const core = window.__TAURI__?.core
  if (core !== undefined) {
    try {
      await core.invoke('set_token', { token })
    } catch (error) {
      console.error('uicp-nav: set_token failed, keeping in-memory token', error)
    }
  }
  memoryToken = token
  setCurrentToken(token)
}

export async function clearToken(): Promise<void> {
  const core = window.__TAURI__?.core
  if (core !== undefined) {
    try {
      await core.invoke('clear_token')
    } catch (error) {
      console.error('uicp-nav: clear_token failed', error)
    }
  }
  memoryToken = undefined
  setCurrentToken(undefined)
}

/**
 * Platform API base. In the browser (shell / `dsh web`) the page is served
 * from the local host, so platform calls go through the same-origin
 * `/uicp-api` proxy; elsewhere (tests/scripts) fall back to the direct URL.
 */
export const API_BASE = typeof window === 'undefined'
  ? 'https://api.underwork.cn/uicp'
  : window.__UICP_API_BASE__ ?? '/uicp-api'
