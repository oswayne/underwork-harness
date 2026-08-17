import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { TenantSwitch } from '../src/client/TenantSwitch.tsx'
import { SessionSwitchAction } from '../src/client/SessionSwitchAction.tsx'
import { createSession, openSession, registerAppWorkspace, resetNav } from '../src/client/nav.ts'

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
  ctx.provide('sessions', { open } as never)
  ctx.provide('workspaces', { create: createWorkspace, startSession, rename: renameWorkspace, createDirectory } as never)
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  return {
    ctx, slots: ctx.get('slots') as SlotRegistry, locale, open, createWorkspace, startSession, renameWorkspace, createDirectory,
  }
}

function declare(slots: SlotRegistry, entries: Array<[string, 'single' | 'list', 'root' | 'session']>): void {
  const children = Object.fromEntries(entries.map(([name, kind, scope]) => [name, { kind, scope }]))
  slots.register({ name: 'root', children } as never, () => null)
}

describe('ui-uicp-nav apply', () => {
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
  })
})
