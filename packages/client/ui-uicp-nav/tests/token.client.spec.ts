// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearToken, getToken, setToken } from '../src/client/token.ts'

describe('ui-uicp-nav token', () => {
  beforeEach(() => {
    delete (window as { __TAURI__?: unknown }).__TAURI__
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('falls back to memory without the shell bridge', async () => {
    expect(await getToken()).toBeUndefined()
    await setToken('mem-token')
    expect(await getToken()).toBe('mem-token')
    await clearToken()
    expect(await getToken()).toBeUndefined()
  })

  it('prefers the shell bridge and ignores non-string results', async () => {
    const invoke = vi.fn(async (): Promise<unknown> => 'bridge-token')
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } }
    expect(await getToken()).toBe('bridge-token')
    invoke.mockResolvedValueOnce(undefined)
    expect(await getToken()).toBeUndefined()
    await setToken('new')
    expect(invoke).toHaveBeenCalledWith('set_token', { token: 'new' })
    await clearToken()
    expect(invoke).toHaveBeenCalledWith('clear_token')
  })

  it('keeps the in-memory token when the shell bridge rejects', async () => {
    const invoke = vi.fn(async () => { throw new Error('not allowed') })
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await setToken('mem-fallback')
    expect(await getToken()).toBe('mem-fallback')
  })
})
