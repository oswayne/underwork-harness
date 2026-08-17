// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { zh } from '../src/locales.ts'
import { resetNav, setNavActions, setPackagesRoot } from '../src/client/nav.ts'
import { resetAuth } from '../src/client/token.ts'
import { TenantNav } from '../src/client/TenantNav.tsx'

const t = ((key: string) => zh[key as keyof typeof zh]) as never

function listState(sessions: Array<{ id: string; cwd?: string; title: string }>, current?: string) {
  const byId = Object.fromEntries(sessions.map(s => [s.id, {
    id: s.id, cwd: s.cwd, displayTitle: s.title, updatedAt: Date.now() - 60_000,
  }]))
  return { ids: sessions.map(s => s.id), byId, current, phase: 'ready' } as never
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

function navProps(state: unknown) {
  return {
    t, useSessions: useSessionsStub(state), wide: true, expandSidebar: () => undefined,
  } as unknown as PropsRuntime<'sidebar.workspaces'> & PropsLocale<'nav'>
}

describe('TenantNav', () => {
  beforeEach(() => {
    resetNav()
    resetAuth()
    window.localStorage.clear()
    setPackagesRoot('/root')
    setNavActions({ openSession: vi.fn(), createSession: vi.fn(async () => undefined) })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete (window as { __TAURI__?: unknown }).__TAURI__
  })

  it('renders nothing while no token is stored', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: vi.fn(async () => undefined) } }
    render(<TenantNav {...navProps(listState([]))} />)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('lists tenants as project roots once a token is stored', async () => {
    const invoke = vi.fn(async (cmd: string) => {
      if (cmd === 'get_token') return 'tok'
      if (cmd === 'app_packages_root') return '/root'
      return undefined
    })
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/systemctl/tenant/list')) {
        // Platform list responses omit `status` on success.
        return new Response(JSON.stringify({ data: [{ _id: 't9', name: '租户B', identifier: 'tenant-b', available: true }] }))
      }
      return new Response(JSON.stringify({ status: 0, data: [] }))
    }))
    render(<TenantNav {...navProps(listState([]))} />)
    expect(await screen.findByRole('treeitem', { name: /租户B/ })).toBeTruthy()
  })

  it('surfaces tenant fetch errors', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: shellInvoke() } }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/user/user/self')) return new Response(JSON.stringify({ data: {} }))
      return new Response(JSON.stringify({ status: 400, msg: 'bad' }))
    }))
    render(<TenantNav {...navProps(listState([]))} />)
    expect(await screen.findByText('Error: bad')).toBeTruthy()
  })

  it('navigates project → app-package → sessions as a tree and switches sessions', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: shellInvoke() } }
    const openSession = vi.fn()
    const createSession = vi.fn(async () => undefined)
    setNavActions({ openSession, createSession })
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
    render(<TenantNav {...navProps(sessions)} />)
    fireEvent.click(await screen.findByRole('treeitem', { name: /租户A/ }))
    fireEvent.click(await screen.findByRole('treeitem', { name: '应用' }))
    expect(await screen.findByRole('treeitem', { name: /会话1/ })).toBeTruthy()
    expect(screen.queryByRole('treeitem', { name: /其它/ })).toBeNull()
    fireEvent.click(screen.getByRole('treeitem', { name: /会话1/ }))
    expect(openSession).toHaveBeenCalledWith('s1')
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
    expect(createSession).toHaveBeenCalledWith('/root/tenant-a/app-x')
    cleanup()
  })

  it('collapses the session list when the app package row closes', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: shellInvoke() } }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/systemctl/tenant/list')) {
        return new Response(JSON.stringify({ status: 0, data: [{ _id: 't1', name: '租户A', identifier: 'tenant-a', available: true }] }))
      }
      return new Response(JSON.stringify({ status: 0, data: [{ _id: 'a1', name: '应用', identifier: 'app-x' }] }))
    }))
    const sessions = listState([{ id: 's1', cwd: '/root/tenant-a/app-x', title: '会话1' }])
    render(<TenantNav {...navProps(sessions)} />)
    fireEvent.click(await screen.findByRole('treeitem', { name: /租户A/ }))
    const appRow = await screen.findByRole('treeitem', { name: '应用' })
    fireEvent.click(appRow)
    expect(await screen.findByRole('treeitem', { name: /会话1/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('treeitem', { name: '应用' }))
    expect(screen.queryByRole('treeitem', { name: /会话1/ })).toBeNull()
  })

  it('starts collapsed and reveals sessions only after expanding both levels', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: shellInvoke() } }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/systemctl/tenant/list')) {
        return new Response(JSON.stringify({ status: 0, data: [{ _id: 't1', name: '租户A', identifier: 'tenant-a', available: true }] }))
      }
      return new Response(JSON.stringify({ status: 0, data: [{ _id: 'a1', name: '应用', identifier: 'app-x' }] }))
    }))
    const sessions = listState([{ id: 's1', cwd: '/root/tenant-a/app-x', title: '会话1' }], 's1')
    render(<TenantNav {...navProps(sessions)} />)
    expect(await screen.findByRole('treeitem', { name: /租户A/ })).toBeTruthy()
    expect(screen.queryByRole('treeitem', { name: /会话1/ })).toBeNull()
    fireEvent.click(screen.getByRole('treeitem', { name: /租户A/ }))
    fireEvent.click(await screen.findByRole('treeitem', { name: '应用' }))
    expect(await screen.findByRole('treeitem', { name: /会话1/ })).toBeTruthy()
    expect(screen.getByRole('treeitem', { name: /会话1/ }).getAttribute('aria-selected')).toBe('true')
  })

  it('logs out and clears the browsing tree', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: shellInvoke() } }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 0, data: [] }))))
    render(<TenantNav {...navProps(listState([]))} />)
    fireEvent.click(await screen.findByRole('button', { name: '退出' }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '退出' })).toBeNull()
    })
  })

  it('cancels the in-flight tenant request on unmount', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: shellInvoke() } }
    let resolveFetch: (value: Response) => void = () => undefined
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.endsWith('/user/user/self')) {
        return Promise.resolve(new Response(JSON.stringify({ data: {} })))
      }
      return new Promise<Response>((resolve) => { resolveFetch = resolve })
    }))
    const { unmount } = render(<TenantNav {...navProps(listState([]))} />)
    unmount()
    resolveFetch(new Response(JSON.stringify({ status: 0, data: [] })))
    await new Promise(resolve => setTimeout(resolve, 0))
  })

  it('highlights the selected app package row', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: shellInvoke() } }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/systemctl/tenant/list')) {
        return new Response(JSON.stringify({ status: 0, data: [{ _id: 't1', name: '租户A', identifier: 'tenant-a', available: true }] }))
      }
      return new Response(JSON.stringify({ status: 0, data: [{ _id: 'a1', name: '应用', identifier: 'app-x' }] }))
    }))
    render(<TenantNav {...navProps(listState([]))} />)
    fireEvent.click(await screen.findByRole('treeitem', { name: /租户A/ }))
    fireEvent.click(await screen.findByRole('treeitem', { name: '应用' }))
    expect(screen.getByRole('treeitem', { name: '应用' }).className).toMatch(/selected/)
  })

  it('surfaces app-package fetch errors', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: shellInvoke() } }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/user/user/self')) {
        return new Response(JSON.stringify({ data: {} }))
      }
      if (url.endsWith('/systemctl/tenant/list')) {
        return new Response(JSON.stringify({ status: 0, data: [{ _id: 't1', name: '租户A', identifier: 'tenant-a', available: true }] }))
      }
      return new Response(JSON.stringify({ status: 400, msg: 'apps-bad' }))
    }))
    render(<TenantNav {...navProps(listState([]))} />)
    fireEvent.click(await screen.findByRole('treeitem', { name: /租户A/ }))
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
    render(<TenantNav {...navProps(listState([]))} />)
    fireEvent.click(await screen.findByRole('treeitem', { name: /租户A/ }))
    fireEvent.click(await screen.findByRole('treeitem', { name: '应用' }))
    expect(screen.queryByRole('button', { name: '新建会话' })).toBeNull()
    expect(screen.getByText('（空）')).toBeTruthy()
  })
})
