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
    window.localStorage.clear()
    vi.unstubAllGlobals()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.localStorage.clear()
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
    window.localStorage.setItem('uicp.platform.token', 'tok')
    render(<LoginPage t={t} />)
    expect(await screen.findByText('Underwork Harness')).toBeTruthy()
    expect(screen.getByText('正在验证 Token…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '登录' })).toBeNull()
    resolveFetch(new Response(JSON.stringify({ data: {} })))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '登录' })).toBeNull()
    })
  })

  it('hides the gate once a stored token validates', async () => {
    selfOk()
    window.localStorage.setItem('uicp.platform.token', 'tok')
    render(<LoginPage t={t} />)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '登录' })).toBeNull()
    })
  })

  it('signs in through the form and stores the token', async () => {
    selfOk()
    render(<LoginPage t={t} />)
    fireEvent.change(await screen.findByLabelText('登录'), { target: { value: 'jwt-1' } })
    fireEvent.submit(screen.getByRole('button', { name: '登录' }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '登录' })).toBeNull()
    })
    expect(window.localStorage.getItem('uicp.platform.token')).toBe('jwt-1')
  })

  it('keeps the gate and explains when the token is invalid', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 401, msg: 'bad' }), { status: 401 })))
    render(<LoginPage t={t} />)
    fireEvent.change(await screen.findByLabelText('登录'), { target: { value: 'expired' } })
    fireEvent.submit(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByText('Token 无效，请重新输入')).toBeTruthy()
    expect(screen.getByRole('button', { name: '登录' })).toBeTruthy()
  })
})
