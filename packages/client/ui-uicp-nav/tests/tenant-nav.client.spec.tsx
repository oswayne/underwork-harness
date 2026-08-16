// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { zh } from '../src/locales.ts'
import { resetNav, setNavActions, setPackagesRoot } from '../src/client/nav.ts'
import { TenantNav } from '../src/client/TenantNav.tsx'

const t = ((key: string) => zh[key as keyof typeof zh]) as never

function listState(sessions: Array<{ id: string; cwd?: string; title: string }>) {
  const byId = Object.fromEntries(sessions.map(s => [s.id, { id: s.id, cwd: s.cwd, displayTitle: s.title }]))
  return { ids: sessions.map(s => s.id), byId, current: undefined, phase: 'ready' } as never
}

function shellInvoke() {
  return vi.fn(async (cmd: string) => {
    if (cmd === 'get_token') return 'tok'
    if (cmd === 'app_packages_root') return '/root'
    return undefined
  })
}

function useSessionsStub(state: unknown) {
  return ((sel: (s: unknown) => unknown) => sel(state)) as never
}

describe('TenantNav', () => {
  beforeEach(() => {
    resetNav()
    setPackagesRoot('/root')
    setNavActions({ openSession: vi.fn(), createSession: vi.fn(async () => undefined) })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete (window as { __TAURI__?: unknown }).__TAURI__
  })

  it('shows the login view when no token is stored', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: vi.fn(async () => undefined) } }
    render(<TenantNav t={t} useSessions={useSessionsStub(listState([]))} />)
    expect(await screen.findByRole('button', { name: '登录' })).toBeTruthy()
  })

  it('surfaces tenant fetch errors', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: shellInvoke() } }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 400, msg: 'bad' }))))
    render(<TenantNav t={t} useSessions={useSessionsStub(listState([]))} />)
    expect(await screen.findByText('Error: bad')).toBeTruthy()
  })

  it('navigates tenant → app-package → sessions and switches sessions', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: shellInvoke() } }
    const openSession = vi.fn()
    setNavActions({ openSession, createSession: vi.fn(async () => undefined) })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/systemctl/tenant/list')) {
        return new Response(JSON.stringify({ status: 0, data: [{ _id: 't1', name: '租户A', identifier: 'tenant-a', available: true }] }))
      }
      return new Response(JSON.stringify({ status: 0, data: [{ _id: 'a1', name: '应用', identifier: 'app-x' }] }))
    }))
    const sessions = listState([
      { id: 's1', cwd: '/root/tenant-a/app-x', title: '会话1' },
      { id: 's2', cwd: '/other', title: '其它' },
    ])
    render(<TenantNav t={t} useSessions={useSessionsStub(sessions)} />)
    fireEvent.click(await screen.findByRole('button', { name: '租户A（tenant-a）' }))
    fireEvent.click(await screen.findByRole('button', { name: '应用' }))
    expect(await screen.findByRole('button', { name: '会话1' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '其它' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '会话1' }))
    expect(openSession).toHaveBeenCalledWith('s1')
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
    cleanup()
  })

  it('logs out back to the login view', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: shellInvoke() } }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 0, data: [] }))))
    render(<TenantNav t={t} useSessions={useSessionsStub(listState([]))} />)
    fireEvent.click(await screen.findByRole('button', { name: '退出' }))
    expect(await screen.findByRole('button', { name: '登录' })).toBeTruthy()
  })

  it('cancels the in-flight tenant request on unmount', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: shellInvoke() } }
    let resolveFetch: (value: Response) => void = () => undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve })))
    const { unmount } = render(<TenantNav t={t} useSessions={useSessionsStub(listState([]))} />)
    unmount()
    resolveFetch(new Response(JSON.stringify({ status: 0, data: [] })))
    await new Promise(resolve => setTimeout(resolve, 0))
  })

  it('keeps the app selection highlight on the current app', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: shellInvoke() } }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/systemctl/tenant/list')) {
        return new Response(JSON.stringify({ status: 0, data: [{ _id: 't1', name: '租户A', identifier: 'tenant-a', available: true }] }))
      }
      return new Response(JSON.stringify({ status: 0, data: [{ _id: 'a1', name: '应用', identifier: 'app-x' }] }))
    }))
    render(<TenantNav t={t} useSessions={useSessionsStub(listState([]))} />)
    fireEvent.click(await screen.findByRole('button', { name: '租户A（tenant-a）' }))
    fireEvent.click(await screen.findByRole('button', { name: '应用' }))
    expect((await screen.findByRole('button', { name: '应用' })).hasAttribute('disabled')).toBe(true)
  })

  it('surfaces app-package fetch errors', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: shellInvoke() } }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/systemctl/tenant/list')) {
        return new Response(JSON.stringify({ status: 0, data: [{ _id: 't1', name: '租户A', identifier: 'tenant-a', available: true }] }))
      }
      return new Response(JSON.stringify({ status: 400, msg: 'apps-bad' }))
    }))
    render(<TenantNav t={t} useSessions={useSessionsStub(listState([]))} />)
    fireEvent.click(await screen.findByRole('button', { name: '租户A（tenant-a）' }))
    expect(await screen.findByText('Error: apps-bad')).toBeTruthy()
  })

  it('omits the new-session button when the packages root is unknown', async () => {
    resetNav()
    ;(window as { __TAURI__?: unknown }).__TAURI__ = {
      core: { invoke: vi.fn(async (cmd: string) => (cmd === 'get_token' ? 'tok' : undefined)) },
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/systemctl/tenant/list')) {
        return new Response(JSON.stringify({ status: 0, data: [{ _id: 't1', name: '租户A', identifier: 'tenant-a', available: true }] }))
      }
      return new Response(JSON.stringify({ status: 0, data: [{ _id: 'a1', name: '应用', identifier: 'app-x' }] }))
    }))
    render(<TenantNav t={t} useSessions={useSessionsStub(listState([]))} />)
    fireEvent.click(await screen.findByRole('button', { name: '租户A（tenant-a）' }))
    fireEvent.click(await screen.findByRole('button', { name: '应用' }))
    expect(screen.queryByRole('button', { name: '新建会话' })).toBeNull()
    expect(screen.getByText('（空）')).toBeTruthy()
  })
})
