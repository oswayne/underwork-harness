// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { zh } from '../src/locales.ts'
import { resetNav, setNavActions, setPackagesRoot } from '../src/client/nav.ts'
import { resetAuth } from '../src/client/token.ts'
import { TenantSwitch } from '../src/client/TenantSwitch.tsx'

const t = ((key: string) => zh[key as keyof typeof zh]) as never

function shellInvoke() {
  return vi.fn(async (cmd: string) => {
    if (cmd === 'get_token') return 'tok'
    if (cmd === 'app_packages_root') return '/root'
    return undefined
  })
}

function navProps(wide = true, workspaces: Array<{ workspaceId: string; path: string }> = []) {
  const useWorkspaces = ((sel: (s: unknown) => unknown) => sel({
    items: workspaces, archivedSessionIds: [], state: 'idle', phase: 'pending',
    error: null, baselinesReady: true, recentWorkspaceId: undefined,
  })) as never
  return { t, wide, useWorkspaces } as unknown as PropsRuntime<'sidebar.footer.action'> & PropsLocale<'nav'>
}

describe('TenantSwitch', () => {
  beforeEach(() => {
    resetNav()
    resetAuth()
    window.localStorage.clear()
    setPackagesRoot('/root')
    setNavActions({
      openSession: vi.fn(),
      createSession: vi.fn(async () => undefined),
      renameSession: vi.fn(async () => undefined),
      forkSession: vi.fn(),
      archiveSession: vi.fn(async () => undefined),
      registerAppWorkspace: vi.fn(async () => undefined),
      deleteWorkspace: vi.fn(async () => undefined),
    })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete (window as { __TAURI__?: unknown }).__TAURI__
  })

  it('renders nothing while no token is stored', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: vi.fn(async () => undefined) } }
    render(<TenantSwitch {...navProps()} />)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('lists tenants and registers the default tenant app packages as workspaces', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: shellInvoke() } }
    const register = vi.fn(async () => undefined)
    setNavActions({
      openSession: vi.fn(), createSession: vi.fn(async () => undefined),
      renameSession: vi.fn(async () => undefined), forkSession: vi.fn(),
      archiveSession: vi.fn(async () => undefined), registerAppWorkspace: register,
      deleteWorkspace: vi.fn(async () => undefined),
    })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/systemctl/tenant/list')) {
        return new Response(JSON.stringify({ status: 0, data: [
          { _id: 't1', name: '租户A', identifier: 'tenant-a', available: true },
          { _id: 't2', name: '租户B', identifier: 'tenant-b', available: true },
        ] }))
      }
      return new Response(JSON.stringify({ status: 0, data: [
        { _id: 'a1', name: '应用', identifier: 'app-x' },
      ] }))
    }))
    render(<TenantSwitch {...navProps()} />)
    fireEvent.click(await screen.findByRole('button', { name: '租户A' }))
    expect(await screen.findByRole('menuitem', { name: '租户A' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '租户B' })).toBeTruthy()
    await waitFor(() => {
      expect(register).toHaveBeenCalledWith('/root/tenant-a/app-x', '应用')
    })
  })

  it('registers the newly selected tenant app packages', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: shellInvoke() } }
    const register = vi.fn(async () => undefined)
    setNavActions({
      openSession: vi.fn(), createSession: vi.fn(async () => undefined),
      renameSession: vi.fn(async () => undefined), forkSession: vi.fn(),
      archiveSession: vi.fn(async () => undefined), registerAppWorkspace: register,
      deleteWorkspace: vi.fn(async () => undefined),
    })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/systemctl/tenant/list')) {
        return new Response(JSON.stringify({ status: 0, data: [
          { _id: 't1', name: '租户A', identifier: 'tenant-a', available: true },
          { _id: 't2', name: '租户B', identifier: 'tenant-b', available: true },
        ] }))
      }
      return new Response(JSON.stringify({ status: 0, data: [
        { _id: 'a2', name: '应用B', identifier: 'app-y' },
      ] }))
    }))
    render(<TenantSwitch {...navProps()} />)
    fireEvent.click(await screen.findByRole('button', { name: '租户A' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '租户B' }))
    await waitFor(() => {
      expect(register).toHaveBeenCalledWith('/root/tenant-b/app-y', '应用B')
    })
  })

  it('shows a loading state and masks the sidebar while the tenant switch is in flight', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: shellInvoke() } }
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const register = vi.fn(async () => { await gate })
    setNavActions({
      openSession: vi.fn(), createSession: vi.fn(async () => undefined),
      renameSession: vi.fn(async () => undefined), forkSession: vi.fn(),
      archiveSession: vi.fn(async () => undefined), registerAppWorkspace: register,
      deleteWorkspace: vi.fn(async () => undefined),
    })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/systemctl/tenant/list')) {
        return new Response(JSON.stringify({ status: 0, data: [
          { _id: 't1', name: '租户A', identifier: 'tenant-a', available: true },
          { _id: 't2', name: '租户B', identifier: 'tenant-b', available: true },
        ] }))
      }
      return new Response(JSON.stringify({ status: 0, data: [
        { _id: 'a2', name: '应用B', identifier: 'app-y' },
      ] }))
    }))
    render(<TenantSwitch {...navProps()} />)
    fireEvent.click(await screen.findByRole('button', { name: '租户A' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '租户B' }))
    const trigger = await screen.findByRole('button', { name: '租户B' })
    expect(trigger.getAttribute('aria-busy')).toBe('true')
    expect(await screen.findByText('正在切换租户…')).toBeTruthy()
    release?.()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '租户B' }).getAttribute('aria-busy')).toBe('false')
      expect(screen.queryByText('正在切换租户…')).toBeNull()
    })
  })

  it('prunes other tenants app-package workspaces when switching tenants', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: shellInvoke() } }
    const del = vi.fn(async () => undefined)
    setNavActions({
      openSession: vi.fn(), createSession: vi.fn(async () => undefined),
      renameSession: vi.fn(async () => undefined), forkSession: vi.fn(),
      archiveSession: vi.fn(async () => undefined),
      registerAppWorkspace: vi.fn(async () => undefined), deleteWorkspace: del,
    })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/systemctl/tenant/list')) {
        return new Response(JSON.stringify({ status: 0, data: [
          { _id: 't1', name: '租户A', identifier: 'tenant-a', available: true },
          { _id: 't2', name: '租户B', identifier: 'tenant-b', available: true },
        ] }))
      }
      return new Response(JSON.stringify({ status: 0, data: [
        { _id: 'a1', name: '应用', identifier: 'app-x' },
      ] }))
    }))
    const workspaces = [
      { workspaceId: 'ws-a', path: '/root/tenant-a/app-x' },
      { workspaceId: 'ws-b', path: '/root/tenant-b/app-x' },
    ]
    render(<TenantSwitch {...navProps(true, workspaces)} />)
    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('ws-b')
    })
    fireEvent.click(screen.getByRole('button', { name: '租户A' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '租户B' }))
    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('ws-a')
    })
  })

  it('skips workspace registration when the packages root is unknown', async () => {
    resetNav()
    ;(window as { __TAURI__?: unknown }).__TAURI__ = {
      core: { invoke: vi.fn(async (cmd: string) => (cmd === 'get_token' ? 'tok' : undefined)) },
    }
    const register = vi.fn(async () => undefined)
    setNavActions({
      openSession: vi.fn(), createSession: vi.fn(async () => undefined),
      renameSession: vi.fn(async () => undefined), forkSession: vi.fn(),
      archiveSession: vi.fn(async () => undefined), registerAppWorkspace: register,
      deleteWorkspace: vi.fn(async () => undefined),
    })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/systemctl/tenant/list')) {
        return new Response(JSON.stringify({ status: 0, data: [
          { _id: 't1', name: '租户A', identifier: 'tenant-a', available: true },
        ] }))
      }
      return new Response(JSON.stringify({ status: 0, data: [
        { _id: 'a1', name: '应用', identifier: 'app-x' },
      ] }))
    }))
    render(<TenantSwitch {...navProps()} />)
    await screen.findByText('无法获取应用包根目录')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(register).not.toHaveBeenCalled()
  })

  it('surfaces real registration failures with their detail', async () => {
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: shellInvoke() } }
    const register = vi.fn(async () => {
      throw new Error('disk full')
    })
    setNavActions({
      openSession: vi.fn(), createSession: vi.fn(async () => undefined),
      renameSession: vi.fn(async () => undefined), forkSession: vi.fn(),
      archiveSession: vi.fn(async () => undefined), registerAppWorkspace: register,
      deleteWorkspace: vi.fn(async () => undefined),
    })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/systemctl/tenant/list')) {
        return new Response(JSON.stringify({ status: 0, data: [
          { _id: 't1', name: '租户A', identifier: 'tenant-a', available: true },
        ] }))
      }
      return new Response(JSON.stringify({ status: 0, data: [
        { _id: 'a1', name: '应用', identifier: 'app-x' },
      ] }))
    }))
    render(<TenantSwitch {...navProps()} />)
    expect(await screen.findByText(/disk full/)).toBeTruthy()
    expect(register).toHaveBeenCalledWith('/root/tenant-a/app-x', '应用')
  })
})
