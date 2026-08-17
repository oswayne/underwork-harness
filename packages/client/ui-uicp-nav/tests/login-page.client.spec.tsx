// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { zh } from '../src/locales.ts'
import { LoginPage } from '../src/client/LoginPage.tsx'
import { resetAuth } from '../src/client/token.ts'

const t = ((key: string) => zh[key as keyof typeof zh]) as never

describe('LoginPage', () => {
  beforeEach(() => {
    resetAuth()
    delete (window as { __TAURI__?: unknown }).__TAURI__
    window.localStorage.clear()
    vi.unstubAllGlobals()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.localStorage.clear()
    delete (window as { __TAURI__?: unknown }).__TAURI__
  })

  /** Platform self endpoint answering success for any token. */
  function selfOk() {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { name: 'u' } }))))
  }

  it('renders the sign-in form while no token is stored', async () => {
    render(<LoginPage t={t} />)
    expect(await screen.findByRole('button', { name: '登录' })).toBeTruthy()
  })

  it('shows a checking seat while validating a stored token', async () => {
    let resolveFetch: (value: Response) => void = () => undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve })))
    ;(window as { __TAURI__?: unknown }).__TAURI__ = {
      core: { invoke: vi.fn(async (cmd: string) => (cmd === 'get_token' ? 'tok' : undefined)) },
    }
    render(<LoginPage t={t} />)
    expect(await screen.findByRole('progressbar')).toBeTruthy()
    resolveFetch(new Response(JSON.stringify({ data: {} })))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '登录' })).toBeNull()
    })
  })

  it('hides the gate once a stored token validates', async () => {
    selfOk()
    ;(window as { __TAURI__?: unknown }).__TAURI__ = {
      core: { invoke: vi.fn(async (cmd: string) => (cmd === 'get_token' ? 'tok' : undefined)) },
    }
    render(<LoginPage t={t} />)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '登录' })).toBeNull()
    })
  })

  it('signs in through the form and stores the token', async () => {
    selfOk()
    const invoke = vi.fn(async () => undefined)
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } }
    render(<LoginPage t={t} />)
    fireEvent.change(await screen.findByLabelText('登录'), { target: { value: 'jwt-1' } })
    fireEvent.submit(screen.getByRole('button', { name: '登录' }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '登录' })).toBeNull()
    })
    expect(invoke).toHaveBeenCalledWith('set_token', { token: 'jwt-1' })
  })

  it('keeps the gate and explains when the token is invalid', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 401, msg: 'bad' }), { status: 401 })))
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: vi.fn(async () => undefined) } }
    render(<LoginPage t={t} />)
    fireEvent.change(await screen.findByLabelText('登录'), { target: { value: 'expired' } })
    fireEvent.submit(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByText('Token 无效，请重新输入')).toBeTruthy()
    expect(screen.getByRole('button', { name: '登录' })).toBeTruthy()
  })
})
