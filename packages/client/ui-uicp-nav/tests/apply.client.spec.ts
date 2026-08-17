import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { TenantNav } from '../src/client/TenantNav.tsx'
import { SessionSwitchAction } from '../src/client/SessionSwitchAction.tsx'
import { createSession, openSession, resetNav } from '../src/client/nav.ts'

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
  ctx.provide('sessions', { open } as never)
  ctx.provide('workspaces', { create: createWorkspace, startSession } as never)
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, open, createWorkspace, startSession }
}

function declare(slots: SlotRegistry, entries: Array<[string, 'single' | 'list', 'root' | 'session']>): void {
  const children = Object.fromEntries(entries.map(([name, kind, scope]) => [name, { kind, scope }]))
  slots.register({ name: 'root', children } as never, () => null)
}

describe('ui-uicp-nav apply', () => {
  it('declares the services it drives', () => {
    expect(inject).toEqual(['slots', 'locale', 'sessions', 'workspaces'])
  })

  it('registers the browser and header action with dictionaries', async () => {
    resetNav()
    const b = await bench()
    declare(b.slots, [['sidebar.workspaces', 'single', 'root'], ['conversation.session.header.actions', 'list', 'session']])
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries('sidebar.workspaces')[0]!.component).toBe(TenantNav)
    const action = b.slots.entries('conversation.session.header.actions')[0]!
    expect(action.component).toBe(SessionSwitchAction)
    expect(b.locale.bind('nav')('login.title')).toBe('登录')
  })

  it('routes session and workspace actions through the provided services', async () => {
    resetNav()
    const b = await bench()
    declare(b.slots, [['sidebar.workspaces', 'single', 'root']])
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    openSession('s1' as never)
    await createSession('/root/t/a')
    expect(b.open).toHaveBeenCalledWith('s1')
    expect(b.createWorkspace).toHaveBeenCalledWith({ path: '/root/t/a' })
    expect(b.startSession).toHaveBeenCalledWith('ws-1')
  })
})
