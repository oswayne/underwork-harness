/**
 * Platform token access for the web app: localStorage is the local store
 * (SharedPreferences-style), kept under one key so the token survives
 * reloads on the fixed server origin. A `jwt` handoff parameter on the page
 * URL takes priority over the stored token, so other pages can navigate in
 * with a fresh credential; after it validates it is adopted into the store
 * and dropped from the URL. In-memory fallback keeps non-browser runs usable.
 * Sign-in phase is decided by validating the effective token against
 * `/user/user/self` on entry.
 */
let memoryToken: string | undefined
/** localStorage key for the platform token. */
const TOKEN_KEY = 'uicp.platform.token'
/** Page URL query parameter carrying the token on cross-page handoffs. */
const URL_TOKEN_KEY = 'jwt'

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
 * @returns the unsubscribe function.
 */
export function subscribeAuth(listener: AuthListener): () => void {
  authListeners.add(listener)
  return () => {
    authListeners.delete(listener)
  }
}

/**
 * Synchronous snapshot of the auth state for useSyncExternalStore.
 * @returns the current auth state.
 */
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

/** Read the `jwt` handoff parameter from the page URL, if present. */
function readUrlToken(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const value = new URLSearchParams(window.location.search).get(URL_TOKEN_KEY)
  return value !== null && value !== '' ? value : undefined
}

/** Drop the consumed `jwt` handoff parameter from the page URL. */
function clearUrlToken(): void {
  /* v8 ignore next -- callers only reach this after a URL jwt was read, which requires a window */
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has(URL_TOKEN_KEY)) return
  url.searchParams.delete(URL_TOKEN_KEY)
  window.history.replaceState(null, '', url)
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
 * resulting auth phase. A URL `jwt` handoff wins over the stored token; after
 * it validates it is adopted into the store and removed from the URL, and an
 * invalid one is cleared together with the stored token. Concurrent callers
 * share one in-flight validation.
 */
export function refreshAuth(): void {
  validation ??= (async () => {
    const token = getToken()
    if (token === undefined) {
      setState({ status: 'anonymous', token: undefined, invalid: false })
      return
    }
    setState({ status: 'checking', token, invalid: false })
    if (!(await validateToken(token))) {
      clearToken()
      clearUrlToken()
      setState({ status: 'anonymous', token: undefined, invalid: true })
      return
    }
    if (readUrlToken() === token) {
      writeLocalToken(token)
      clearUrlToken()
    }
    setState({ status: 'authenticated', token, invalid: false })
  })()
  void validation.finally(() => {
    validation = undefined
  })
}

/** Test hook: reset the auth store between tests. */
export function resetAuth(): void {
  memoryToken = undefined
  authState = initialState
  validation = undefined
}

/**
 * The effective platform token: the URL `jwt` handoff when present, else the
 * persisted value, else the in-memory value.
 * @returns the effective token or undefined.
 */
export function getToken(): string | undefined {
  const urlToken = readUrlToken()
  if (urlToken !== undefined) return urlToken
  const local = readLocalToken()
  if (local !== undefined) return local
  return memoryToken
}

/**
 * Persist a token and validate it, transitioning the auth state.
 * @param token - the platform JWT to adopt.
 */
export async function setToken(token: string): Promise<void> {
  writeLocalToken(token)
  memoryToken = token
  setState({ status: 'checking', token, invalid: false })
  if (!(await validateToken(token))) {
    clearToken()
    setState({ status: 'anonymous', token: undefined, invalid: true })
    return
  }
  setState({ status: 'authenticated', token, invalid: false })
}

/** Drop the persisted and in-memory token, returning to the anonymous state. */
export function clearToken(): void {
  writeLocalToken(undefined)
  memoryToken = undefined
  setState({ status: 'anonymous', token: undefined, invalid: false })
}

/**
 * Platform API base. In the browser (`dsh web`) the page is served
 * from the local host, so platform calls go through the same-origin
 * `/uicp-api` proxy; elsewhere (tests/scripts) fall back to the direct URL.
 */
export const API_BASE = typeof window === 'undefined'
  ? 'https://api.underwork.cn/uicp'
  : '/uicp-api'
