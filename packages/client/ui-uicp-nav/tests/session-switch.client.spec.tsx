// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { zh } from '../src/locales.ts'
import { type NavActions, resetNav, selectApp, selectTenant, setNavActions, setPackagesRoot } from '../src/client/nav.ts'
import { SessionSwitchAction } from '../src/client/SessionSwitchAction.tsx'

const t = ((key: string) => zh[key as keyof typeof zh]) as never

const navActions = (overrides: Partial<NavActions> = {}): NavActions => ({
  openSession: vi.fn(),
  createSession: vi.fn(async () => undefined),
  renameSession: vi.fn(async () => undefined),
  forkSession: vi.fn(),
  archiveSession: vi.fn(async () => undefined),
  registerAppWorkspace: vi.fn(async () => undefined),
  ...overrides,
})

describe('SessionSwitchAction', () => {
  beforeEach(() => {
    resetNav()
    setNavActions(navActions())
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('switches among sessions of the current app package', () => {
    setPackagesRoot('/root')
    selectTenant({ _id: 't1', identifier: 'tenant-a', name: '租户A' })
    selectApp({ _id: 'a1', name: '应用', identifier: 'app-x' })
    const openSession = vi.fn()
    setNavActions(navActions({ openSession, createSession: vi.fn(async () => undefined) }))
    const sessions = {
      ids: ['s1', 's2'],
      byId: {
        s1: { id: 's1', cwd: '/root/tenant-a/app-x', displayTitle: '会话1' },
        s2: { id: 's2', cwd: '/root/tenant-a/app-x', displayTitle: '会话2' },
        s3: { id: 's3', cwd: '/elsewhere', displayTitle: '其它' },
      },
      current: 's1',
      phase: 'ready',
    } as never
    const useSessions = ((sel: (s: unknown) => unknown) => sel(sessions)) as never
    render(<SessionSwitchAction {...({ t, useSessions } as unknown as PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'nav'>)} />)
    fireEvent.change(screen.getByLabelText('会话'), { target: { value: 's2' } })
    expect(openSession).toHaveBeenCalledWith('s2')
  })

  it('falls back to the current session cwd without an app selection', () => {
    const openSession = vi.fn()
    setNavActions(navActions({ openSession, createSession: vi.fn(async () => undefined) }))
    const sessions = {
      ids: ['s1'],
      byId: { s1: { id: 's1', cwd: '/some/dir', displayTitle: '会话1' } },
      current: 's1',
      phase: 'ready',
    } as never
    const useSessions = ((sel: (s: unknown) => unknown) => sel(sessions)) as never
    render(<SessionSwitchAction {...({ t, useSessions } as unknown as PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'nav'>)} />)
    fireEvent.change(screen.getByLabelText('会话'), { target: { value: 's1' } })
    expect(openSession).toHaveBeenCalledWith('s1')
  })
})
