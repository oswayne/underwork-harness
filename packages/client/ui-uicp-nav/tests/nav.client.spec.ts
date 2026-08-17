// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appCwd, archiveSession, createSession, currentApp, currentTenant, forkSession,
  openSession, packagesRoot, registerAppWorkspace, renameSession, resolvePackagesRoot, resetNav,
  selectApp, selectTenant, setNavActions, setPackagesRoot,
} from '../src/client/nav.ts'

const TENANT = { _id: 't1', identifier: 'tenant-a', name: '租户A' }
const APP = { _id: 'a1', name: '应用', identifier: 'app-x' }

describe('ui-uicp-nav nav state', () => {
  beforeEach(() => {
    resetNav()
    delete (window as { __TAURI__?: unknown }).__TAURI__
  })
  afterEach(() => {
    vi.restoreAllMocks()
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
    setNavActions({
      openSession: open, createSession: create, renameSession: rename, forkSession: fork,
      archiveSession: archive, registerAppWorkspace: register,
    })
    openSession('s1' as never)
    await createSession('/p')
    await renameSession('s1' as never, '新标题')
    forkSession('s1' as never)
    await archiveSession('s1' as never)
    await registerAppWorkspace('/p', '应用')
    expect(open).toHaveBeenCalledWith('s1')
    expect(create).toHaveBeenCalledWith('/p')
    expect(rename).toHaveBeenCalledWith('s1', '新标题')
    expect(fork).toHaveBeenCalledWith('s1')
    expect(archive).toHaveBeenCalledWith('s1')
    expect(register).toHaveBeenCalledWith('/p', '应用')
  })

  it('resolves the packages root from the shell when present', async () => {
    const invoke = vi.fn(async () => '/shell/root')
    ;(window as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } }
    await resolvePackagesRoot()
    expect(packagesRoot()).toBe('/shell/root')
    expect(invoke).toHaveBeenCalledWith('app_packages_root')
  })

  it('keeps the root unset without a shell bridge', async () => {
    await resolvePackagesRoot()
    expect(packagesRoot()).toBeUndefined()
  })
})
