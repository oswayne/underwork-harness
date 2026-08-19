// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appCwd, archiveSession, createSession, currentApp, currentTenant, forkSession,
  deleteWorkspace, openSession, packagesRoot, registerAppWorkspace, renameSession,
  resolvePackagesRoot, resetNav, selectApp, selectTenant, setNavActions, setPackagesRoot,
} from '../src/client/nav.ts'

const TENANT = { _id: 't1', identifier: 'tenant-a', name: '租户A' }
const APP = { _id: 'a1', name: '应用', identifier: 'app-x' }

describe('ui-uicp-nav nav state', () => {
  beforeEach(() => {
    resetNav()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('selects tenant and app and derives cwd from the packages root', () => {
    selectTenant(TENANT)
    selectApp(APP)
    expect(currentTenant()).toEqual(TENANT)
    expect(currentApp()).toEqual(APP)
    expect(appCwd(TENANT, APP)).toBeUndefined()
    setPackagesRoot('/root')
    expect(appCwd(TENANT, APP)).toBe('/root/tenant-a/app-x')
    expect(packagesRoot()).toBe('/root')
  })

  it('routes actions only after apply provided them', async () => {
    expect(() => { openSession('s1' as never) }).not.toThrow()
    expect(createSession('/p')).toBeUndefined()
    const open = vi.fn()
    const create = vi.fn(async () => undefined)
    const rename = vi.fn(async () => undefined)
    const fork = vi.fn()
    const archive = vi.fn(async () => undefined)
    const register = vi.fn(async () => undefined)
    const del = vi.fn(async () => undefined)
    setNavActions({
      openSession: open, createSession: create, renameSession: rename, forkSession: fork,
      archiveSession: archive, registerAppWorkspace: register, deleteWorkspace: del,
    })
    openSession('s1' as never)
    await createSession('/p')
    await renameSession('s1' as never, '新标题')
    forkSession('s1' as never)
    await archiveSession('s1' as never)
    await registerAppWorkspace('/p', '应用')
    await deleteWorkspace('ws-1' as never)
    expect(open).toHaveBeenCalledWith('s1')
    expect(create).toHaveBeenCalledWith('/p')
    expect(rename).toHaveBeenCalledWith('s1', '新标题')
    expect(fork).toHaveBeenCalledWith('s1')
    expect(archive).toHaveBeenCalledWith('s1')
    expect(register).toHaveBeenCalledWith('/p', '应用')
    expect(del).toHaveBeenCalledWith('ws-1')
  })

  it('resolves the packages root from the web server when present', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 0, data: { root: '/root' } }))))
    await resolvePackagesRoot()
    expect(packagesRoot()).toBe('/root')
    expect(fetch).toHaveBeenCalledWith('/uicp/preview/root')
  })

  it('keeps the root unset when the web server is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('unreachable') }))
    await resolvePackagesRoot()
    expect(packagesRoot()).toBeUndefined()
  })
})
