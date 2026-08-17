// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authSnapshot, clearToken, getToken, refreshAuth, resetAuth, setToken, subscribeAuth } from '../src/client/token.ts'

describe('ui-uicp-nav token', () => {
  beforeEach(() => {
    resetAuth()
    delete (window as { __TAURI__?: unknown }).__TAURI__
    window.localStorage.clear()
    vi.unstubAllGlobals()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  /** Platform self endpoint answering success for any token. */
  function selfOk() {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { name: 'u' } }))))
  }

  it('falls back to memory without the shell bridge', async () => {
    selfOk()
    expect(await getToken()).toBeUndefined()
    await setToken('mem-token')
    expect(await getToken()).toBe('mem-token')
    expect(authSnapshot().status).toBe('authenticated')
    await clearToken()
    expect(await getToken()).toBeUndefined()
    expect(authSnapshot().status).toBe('anonymous')
  })

  it('prefers the shell bridge and ignores non-string results', async () => {
    selfOk()
    const invoke = vi.fn(async (): Promise<unknown> => 'bridge-token')
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } }
    expect(await getToken()).toBe('bridge-token')
    // A fresh store with a non-string bridge result falls through to memory.
    window.localStorage.removeItem('uicp.platform.token')
    invoke.mockResolvedValueOnce(undefined)
    expect(await getToken()).toBeUndefined()
    await setToken('new')
    expect(invoke).toHaveBeenCalledWith('set_token', { token: 'new' })
    await clearToken()
    expect(invoke).toHaveBeenCalledWith('clear_token')
  })

  it('adopts the shell-persisted token into localStorage', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = {
      core: { invoke: vi.fn(async (cmd: string) => (cmd === 'get_token' ? 'file-token' : undefined)) },
    }
    expect(await getToken()).toBe('file-token')
    expect(window.localStorage.getItem('uicp.platform.token')).toBe('file-token')
  })

  it('keeps the in-memory token when the shell bridge rejects', async () => {
    selfOk()
    const invoke = vi.fn(async () => { throw new Error('not allowed') })
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await setToken('mem-fallback')
    expect(await getToken()).toBe('mem-fallback')
    expect(authSnapshot().status).toBe('authenticated')
  })

  it('validates a stored token against the platform on refresh', async () => {
    selfOk()
    ;(window as { __TAURI__?: unknown }).__TAURI__ = {
      core: { invoke: vi.fn(async (cmd: string) => (cmd === 'get_token' ? 'tok' : undefined)) },
    }
    refreshAuth()
    await vi.waitFor(() => { expect(authSnapshot().status).toBe('authenticated') })
    expect(authSnapshot().token).toBe('tok')
    expect(fetch).toHaveBeenCalledWith('/uicp-api/user/user/self', { headers: { Authorization: 'tok' } })
  })

  it('clears an invalid stored token and reports the failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 401, msg: 'bad' }), { status: 401 })))
    let stored: string | undefined = 'expired'
    const invoke = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'get_token') return stored
      if (cmd === 'clear_token') { stored = undefined; return undefined }
      if (cmd === 'set_token' && args !== undefined) stored = String(args.token)
      return undefined
    })
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } }
    refreshAuth()
    await vi.waitFor(() => { expect(authSnapshot().status).toBe('anonymous') })
    expect(authSnapshot().invalid).toBe(true)
    expect(invoke).toHaveBeenCalledWith('clear_token')
    expect(await getToken()).toBeUndefined()
  })

  it('notifies auth subscribers on set and clear', async () => {
    selfOk()
    const listener = vi.fn()
    const unsubscribe = subscribeAuth(listener)
    await setToken('a')
    expect(authSnapshot().token).toBe('a')
    expect(authSnapshot().status).toBe('authenticated')
    expect(listener).toHaveBeenCalled()
    await clearToken()
    expect(authSnapshot().token).toBeUndefined()
    expect(authSnapshot().status).toBe('anonymous')
    const calls = listener.mock.calls.length
    unsubscribe()
    await setToken('b')
    expect(listener).toHaveBeenCalledTimes(calls)
  })
})
