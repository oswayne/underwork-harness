/**
 * Platform token access for the M0 shell: the webview's localStorage is the
 * app's local store (SharedPreferences-style), mirrored through the Tauri
 * shell commands to a file in the app data directory. The mirror matters
 * because the desktop sidecar serves on an OS-assigned port that changes
 * between launches, and localStorage is origin-scoped by port. In-memory
 * fallback keeps the web UI usable in a plain browser during development.
 * Sign-in phase is decided by validating the stored token against
 * `/user/user/self` on entry.
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
/** localStorage key for the platform token. */
const TOKEN_KEY = 'uicp.platform.token'

/** Auth listeners run on every effective-token change (sign-in/logout). */
type AuthListener = () => void

/** Sign-in phases driven by stored-token validation against the platform. */
export type AuthStatus = 'checking' | 'authenticated' | 'anonymous'

/** One auth snapshot: phase, the validated token, and the last failure flag. */
export interface AuthState {
  status: AuthStatus
  token: string | undefined
  /** True when the last validation failed (the form shows an explanation). */
  invalid: boolean
}

const initialState: AuthState = { status: 'checking', token: undefined, invalid: false }
let authState: AuthState = initialState
const authListeners = new Set<AuthListener>()
/** In-flight validation shared by concurrent refreshAuth callers. */
let validation: Promise<void> | undefined

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

/** Synchronous snapshot of the auth state for useSyncExternalStore. */
export function authSnapshot(): AuthState {
  return authState
}

function setState(next: AuthState): void {
  authState = next
  for (const listener of authListeners) listener()
}

function readLocalToken(): string | undefined {
  try {
    const value = window.localStorage.getItem(TOKEN_KEY)
    return value !== null && value !== '' ? value : undefined
  } catch {
    // Storage unavailable (non-browser environments): the shell bridge stays authoritative.
    return undefined
  }
}

function writeLocalToken(token: string | undefined): void {
  try {
    if (token === undefined) window.localStorage.removeItem(TOKEN_KEY)
    else window.localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Storage unavailable: the shell bridge stays authoritative.
  }
}

/**
 * Ask the platform whether the JWT still identifies a user. Any failure —
 * transport, HTTP status, or a non-zero platform status — counts as invalid.
 */
async function validateToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/user/user/self`, { headers: { Authorization: token } })
    if (!res.ok) return false
    const body = (await res.json()) as { status?: number }
    return (body.status ?? 0) === 0
  } catch {
    // Transport or parse failure: the JWT cannot be used.
    return false
  }
}

/**
 * Resolve the stored token, validate it against the platform, and publish the
 * resulting auth phase. Concurrent callers share one in-flight validation.
 */
export function refreshAuth(): void {
  validation ??= (async () => {
    const token = await getToken()
    if (token === undefined) {
      setState({ status: 'anonymous', token: undefined, invalid: false })
      return
    }
    setState({ status: 'checking', token, invalid: false })
    if (!(await validateToken(token))) {
      await clearToken()
      setState({ status: 'anonymous', token: undefined, invalid: true })
      return
    }
    setState({ status: 'authenticated', token, invalid: false })
  })()
  void validation.finally(() => {
    validation = undefined
  })
}

/** Test hook: reset the auth store between tests. */
export function resetAuth(): void {
  authState = initialState
  validation = undefined
}

export async function getToken(): Promise<string | undefined> {
  const local = readLocalToken()
  if (local !== undefined) return local
  const core = window.__TAURI__?.core
  if (core !== undefined) {
    try {
      const stored = await core.invoke('get_token')
      if (typeof stored === 'string' && stored !== '') {
        writeLocalToken(stored)
        return stored
      }
    } catch (error) {
      // Shell command not permitted (M0 capability gap): fall through to the
      // in-memory token so the browser flow stays usable.
      console.error('uicp-nav: get_token failed', error)
    }
  }
  return memoryToken
}

export async function setToken(token: string): Promise<void> {
  writeLocalToken(token)
  const core = window.__TAURI__?.core
  if (core !== undefined) {
    try {
      await core.invoke('set_token', { token })
    } catch (error) {
      console.error('uicp-nav: set_token failed, keeping in-memory token', error)
    }
  }
  memoryToken = token
  setState({ status: 'checking', token, invalid: false })
  if (!(await validateToken(token))) {
    await clearToken()
    setState({ status: 'anonymous', token: undefined, invalid: true })
    return
  }
  setState({ status: 'authenticated', token, invalid: false })
}

export async function clearToken(): Promise<void> {
  writeLocalToken(undefined)
  const core = window.__TAURI__?.core
  if (core !== undefined) {
    try {
      await core.invoke('clear_token')
    } catch (error) {
      console.error('uicp-nav: clear_token failed', error)
    }
  }
  memoryToken = undefined
  setState({ status: 'anonymous', token: undefined, invalid: false })
}

/**
 * Platform API base. In the browser (shell / `dsh web`) the page is served
 * from the local host, so platform calls go through the same-origin
 * `/uicp-api` proxy; elsewhere (tests/scripts) fall back to the direct URL.
 */
export const API_BASE = typeof window === 'undefined'
  ? 'https://api.underwork.cn/uicp'
  : window.__UICP_API_BASE__ ?? '/uicp-api'
