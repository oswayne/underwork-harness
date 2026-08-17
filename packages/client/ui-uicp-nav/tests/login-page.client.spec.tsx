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
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    delete (window as { __TAURI__?: unknown }).__TAURI__
  })

  it('renders the sign-in form while no token is stored', async () => {
    render(<LoginPage t={t} />)
    expect(await screen.findByRole('button', { name: '登录' })).toBeTruthy()
  })

  it('hides the gate once a token is resolved from storage', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = {
      core: { invoke: vi.fn(async (cmd: string) => (cmd === 'get_token' ? 'tok' : undefined)) },
    }
    render(<LoginPage t={t} />)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '登录' })).toBeNull()
    })
  })

  it('signs in through the form and stores the token', async () => {
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
})
