// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appCwd, createSession, currentApp, currentTenant, openSession, packagesRoot,
  resolvePackagesRoot, resetNav, selectApp, selectTenant, setNavActions, setPackagesRoot,
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
    setNavActions({ openSession: open, createSession: create })
    openSession('s1' as never)
    await createSession('/p')
    expect(open).toHaveBeenCalledWith('s1')
    expect(create).toHaveBeenCalledWith('/p')
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
