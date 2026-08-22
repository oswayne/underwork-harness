import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as applyHost } from '../src/index.ts'
import { apply, inject } from '../src/client/index.ts'
import { UnderworkBrandMark, UnderworkBrandName } from '../src/client/Brand.tsx'
import { LoginPage } from '../src/client/LoginPage.tsx'
import { TenantSwitch } from '../src/client/TenantSwitch.tsx'
import { SessionSwitchAction } from '../src/client/SessionSwitchAction.tsx'
import { authSnapshot, getToken, refreshAuth } from '../src/client/token.ts'
import {
  archiveSession,
  createSession,
  deleteWorkspace,
  forkSession,
  openSession,
  registerAppWorkspace,
  renameSession,
  resetNav,
  setPackagesRoot,
} from '../src/client/nav.ts'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const open = vi.fn()
  const createWorkspace = vi.fn(async (input: { path: string }) => ({
    workspaceId: 'ws-1' as never,
    path: input.path,
    title: 'app', sessionIds: [], createdAt: '0', updatedAt: '0',
  }))
  const startSession = vi.fn()
  const renameWorkspace = vi.fn(async () => undefined)
  const createDirectory = vi.fn(async () => undefined)
  const sessionRename = vi.fn(async (_title: string): Promise<{ ok: boolean; error?: { message: string } }> => ({ ok: true }))
  const fork = vi.fn(async () => 'child-1' as never)
  const archive = vi.fn(async () => undefined)
  const remove = vi.fn(async () => undefined)
  ctx.provide('sessions', {
    open,
    binding: (id: string) => (id === 'known' ? { session: { rename: sessionRename } } : undefined),
    fork,
  } as never)
  ctx.provide('workspaces', {
    create: createWorkspace,
    startSession,
    rename: renameWorkspace,
    createDirectory,
    archiveSession: archive,
    delete: remove,
  } as never)
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  return {
    ctx, slots: ctx.get('slots') as SlotRegistry, locale, open, createWorkspace, startSession, renameWorkspace,
    createDirectory, sessionRename, fork, archive, remove,
  }
}

function declare(slots: SlotRegistry, entries: Array<[string, 'single' | 'list', 'root' | 'session']>): void {
  const children = Object.fromEntries(entries.map(([name, kind, scope]) => [name, { kind, scope }]))
  slots.register({ name: 'root', children } as never, () => null)
}

describe('ui-uicp-nav apply', () => {
  it('token store stays anonymous without a window and without a stored token', () => {
    expect(getToken()).toBeUndefined()
    refreshAuth()
    expect(authSnapshot().status).toBe('anonymous')
  })

  it('declares the services it drives', () => {
    expect(inject).toEqual(['slots', 'locale', 'sessions', 'workspaces'])
  })

  it('registers the tenant switch and header action with dictionaries', async () => {
    resetNav()
    const b = await bench()
    declare(b.slots, [['sidebar.footer.action', 'list', 'root'], ['conversation.session.header.actions', 'list', 'session']])
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries('sidebar.footer.action')[0]!.component).toBe(TenantSwitch)
    const action = b.slots.entries('conversation.session.header.actions')[0]!
    expect(action.component).toBe(SessionSwitchAction)
    // The test lane never runs browser-language detection, so the runtime
    // opens on the fallback locale (en); state the asserted locale explicitly.
    b.locale.setLocale('zh')
    expect(b.locale.bind('nav')('login.title')).toBe('登录')
  })

  it('routes session and workspace actions through the provided services', async () => {
    resetNav()
    const b = await bench()
    declare(b.slots, [['sidebar.footer.action', 'list', 'root']])
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    openSession('s1' as never)
    await createSession('/root/t/a')
    await registerAppWorkspace('/root/t/a', '应用')
    expect(b.open).toHaveBeenCalledWith('s1')
    expect(b.createWorkspace).toHaveBeenCalledWith({ path: '/root/t/a' })
    expect(b.startSession).toHaveBeenCalledWith('ws-1')
    expect(b.renameWorkspace).toHaveBeenCalledWith('ws-1', '应用')
    expect(b.createDirectory).toHaveBeenCalledWith('/root', 't')
    expect(b.createDirectory).toHaveBeenCalledWith('/root/t', 'a')
    b.createDirectory.mockRejectedValueOnce(new Error('exists')).mockRejectedValueOnce(new Error('exists'))
    b.renameWorkspace.mockRejectedValueOnce(new Error('conflict'))
    await registerAppWorkspace('/root/t/a', '应用')
    expect(b.createWorkspace).toHaveBeenCalledTimes(3)
  })

  it('registers the Underwork brand occupants and the full-window login gate', async () => {
    resetNav()
    const b = await bench()
    declare(b.slots, [
      ['sidebar.brand.mark', 'single', 'root'],
      ['sidebar.brand.name', 'single', 'root'],
      ['conversation.hero.brand.mark', 'single', 'session'],
      ['shell.overlay', 'single', 'root'],
    ])
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries('sidebar.brand.mark')[0]!.component).toBe(UnderworkBrandMark)
    expect(b.slots.entries('sidebar.brand.name')[0]!.component).toBe(UnderworkBrandName)
    expect(b.slots.entries('conversation.hero.brand.mark')[0]!.component).toBe(UnderworkBrandMark)
    const overlay = b.slots.entries('shell.overlay')[0]!
    expect(overlay.options.id).toBe('uicp.login')
    expect(overlay.component).toBe(LoginPage)
  })

  it('routes rename, fork, archive, and delete through the provided services', async () => {
    resetNav()
    const b = await bench()
    declare(b.slots, [['sidebar.footer.action', 'list', 'root']])
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    await renameSession('known' as never, '新标题')
    expect(b.sessionRename).toHaveBeenCalledWith('新标题')
    b.sessionRename.mockResolvedValueOnce({ ok: false, error: { message: '已占用' } })
    await expect(renameSession('known' as never, '撞名')).rejects.toThrow('已占用')
    await expect(renameSession('unknown' as never, 'x')).rejects.toThrow('unknown session "unknown"')

    forkSession('s1' as never)
    await vi.waitFor(() => { expect(b.open).toHaveBeenCalledWith('child-1') })
    b.fork.mockRejectedValueOnce(new Error('boom'))
    forkSession('s2' as never)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(b.open).toHaveBeenCalledTimes(1)

    await archiveSession('s3' as never)
    expect(b.archive).toHaveBeenCalledWith('s3')
    await deleteWorkspace('ws-1' as never)
    expect(b.remove).toHaveBeenCalledWith('ws-1')
  })

  it('guards managed workspaces under the resolved app-packages root', async () => {
    resetNav()
    const b = await bench()
    declare(b.slots, [])
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const guard = b.ctx.reflect.get('managedWorkspaces') as { isManaged: (path: string) => boolean }
    expect(guard.isManaged('/x')).toBe(false)
    setPackagesRoot('/root')
    expect(guard.isManaged('/root/t/a')).toBe(true)
    expect(guard.isManaged('/else')).toBe(false)
  })

  it('host half applies as a no-op', () => {
    expect(() => { applyHost() }).not.toThrow()
  })
})
