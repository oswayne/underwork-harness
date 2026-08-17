// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { zh } from '../src/locales.ts'
import { LoginView } from '../src/client/LoginView.tsx'

const t = ((key: string) => zh[key as keyof typeof zh]) as never

describe('LoginView', () => {
  afterEach(cleanup)

  it('shows the brand beside the logo without a visible login label', () => {
    const onSignIn = vi.fn()
    render(<LoginView t={t} onSignIn={onSignIn} />)
    expect(screen.getByText('Underwork Harness')).toBeTruthy()
    expect(document.querySelector('label')).toBeNull()
  })

  it('submits a non-blank token through onSignIn', () => {
    const onSignIn = vi.fn()
    render(<LoginView t={t} onSignIn={onSignIn} />)
    const input = screen.getByLabelText('登录') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'jwt-1' } })
    fireEvent.submit(screen.getByRole('button', { name: '登录' }))
    expect(onSignIn).toHaveBeenCalledWith('jwt-1')
  })

  it('ignores a blank submission', () => {
    const onSignIn = vi.fn()
    render(<LoginView t={t} onSignIn={onSignIn} />)
    fireEvent.submit(screen.getByRole('button', { name: '登录' }))
    expect(onSignIn).not.toHaveBeenCalled()
  })
})
