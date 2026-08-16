// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { zh } from '../src/locales.ts'
import { LoginView } from '../src/client/LoginView.tsx'

const t = ((key: string) => zh[key as keyof typeof zh]) as never

describe('LoginView', () => {
  afterEach(cleanup)

  it('submits a non-blank token through setToken', async () => {
    const invoke = vi.fn(async () => undefined)
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } }
    render(<LoginView t={t} />)
    const input = screen.getByLabelText('登录') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'jwt-1' } })
    fireEvent.submit(screen.getByRole('button', { name: '登录' }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(invoke).toHaveBeenCalledWith('set_token', { token: 'jwt-1' })
  })

  it('ignores a blank submission', async () => {
    const invoke = vi.fn()
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } }
    render(<LoginView t={t} />)
    fireEvent.submit(screen.getByRole('button', { name: '登录' }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(invoke).not.toHaveBeenCalled()
  })
})
