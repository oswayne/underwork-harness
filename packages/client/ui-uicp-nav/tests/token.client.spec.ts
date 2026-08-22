// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authSnapshot, clearToken, getToken, refreshAuth, resetAuth, setToken, subscribeAuth } from '../src/client/token.ts'

describe('ui-uicp-nav token', () => {
  beforeEach(() => {
    resetAuth()
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

  it('falls back to memory without a stored token', async () => {
    selfOk()
    expect(getToken()).toBeUndefined()
    await setToken('mem-token')
    expect(getToken()).toBe('mem-token')
    expect(authSnapshot().status).toBe('authenticated')
    clearToken()
    expect(getToken()).toBeUndefined()
    expect(authSnapshot().status).toBe('anonymous')
  })

  it('persists the token to localStorage and reads it back', async () => {
    selfOk()
    await setToken('new')
    expect(window.localStorage.getItem('uicp.platform.token')).toBe('new')
    window.localStorage.removeItem('uicp.platform.token')
    expect(getToken()).toBe('new')
    clearToken()
    expect(window.localStorage.getItem('uicp.platform.token')).toBeNull()
  })

  it('validates a stored token against the platform on refresh', async () => {
    selfOk()
    window.localStorage.setItem('uicp.platform.token', 'tok')
    refreshAuth()
    await vi.waitFor(() => { expect(authSnapshot().status).toBe('authenticated') })
    expect(authSnapshot().token).toBe('tok')
    expect(fetch).toHaveBeenCalledWith('/uicp-api/user/user/self', { headers: { Authorization: 'tok' } })
  })

  it('clears an invalid stored token and reports the failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 401, msg: 'bad' }), { status: 401 })))
    window.localStorage.setItem('uicp.platform.token', 'expired')
    refreshAuth()
    await vi.waitFor(() => { expect(authSnapshot().status).toBe('anonymous') })
    expect(authSnapshot().invalid).toBe(true)
    expect(window.localStorage.getItem('uicp.platform.token')).toBeNull()
    expect(getToken()).toBeUndefined()
  })

  it('notifies auth subscribers on set and clear', async () => {
    selfOk()
    const listener = vi.fn()
    const unsubscribe = subscribeAuth(listener)
    await setToken('a')
    expect(authSnapshot().token).toBe('a')
    expect(authSnapshot().status).toBe('authenticated')
    expect(listener).toHaveBeenCalled()
    clearToken()
    expect(authSnapshot().token).toBeUndefined()
    expect(authSnapshot().status).toBe('anonymous')
    const calls = listener.mock.calls.length
    unsubscribe()
    await setToken('b')
    expect(listener).toHaveBeenCalledTimes(calls)
  })

  it('falls back without localStorage and treats transport failures as invalid', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage denied') })
    expect(getToken()).toBeUndefined()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    await setToken('x')
    expect(authSnapshot().status).toBe('anonymous')
    expect(authSnapshot().invalid).toBe(true)
    expect(getToken()).toBeUndefined()
  })

  it('prefers the URL jwt over the stored token and adopts it after validation', async () => {
    selfOk()
    const replaceState = vi.spyOn(History.prototype, 'replaceState').mockImplementation(() => {})
    vi.stubGlobal('location', new URL('http://localhost:3080/?jwt=url-token'))
    window.localStorage.setItem('uicp.platform.token', 'local-token')
    expect(getToken()).toBe('url-token')
    refreshAuth()
    await vi.waitFor(() => { expect(authSnapshot().status).toBe('authenticated') })
    expect(authSnapshot().token).toBe('url-token')
    expect(window.localStorage.getItem('uicp.platform.token')).toBe('url-token')
    const cleaned = replaceState.mock.calls[0]?.[2]
    expect(new URL(String(cleaned)).searchParams.has('jwt')).toBe(false)
  })

  it('treats an invalid URL jwt as authoritative and clears the store', async () => {
    const replaceState = vi.spyOn(History.prototype, 'replaceState').mockImplementation(() => {})
    vi.stubGlobal('location', new URL('http://localhost:3080/?jwt=expired-url'))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 401 }), { status: 401 })))
    window.localStorage.setItem('uicp.platform.token', 'local-token')
    refreshAuth()
    await vi.waitFor(() => { expect(authSnapshot().status).toBe('anonymous') })
    expect(authSnapshot().invalid).toBe(true)
    expect(window.localStorage.getItem('uicp.platform.token')).toBeNull()
    const cleaned = replaceState.mock.calls[0]?.[2]
    expect(new URL(String(cleaned)).searchParams.has('jwt')).toBe(false)
  })
})
