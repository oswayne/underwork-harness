import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { en, zh, type NavKey } from './locales.ts'
import { TenantNav } from './client/TenantNav.tsx'
import { SessionSwitchAction } from './client/SessionSwitchAction.tsx'
import { setNavActions } from './client/nav.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    nav: NavKey
  }
}

const NS = 'nav'

/** Required services: slots for registration, locale for dictionaries. */
export const inject = ['slots', 'locale']

/**
 * UICP navigation plugin, browser half: replaces the sidebar browsing region
 * with the tenant/app/session tree and adds a session switch header action.
 * Registration defers through slots.inject because the target slot owners
 * (ui-sidebar / ui-conversation) may apply in either order.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  setNavActions({
    openSession: (id) => { ctx.sessions.open(id) },
    createSession: async (cwd) => {
      const workspace = await ctx.workspaces.create({ path: cwd })
      ctx.workspaces.startSession(workspace.workspaceId)
    },
  })
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-uicp-nav: dictionaries')
  ctx.effect(
    () => ctx.slots.inject('sidebar.workspaces', () =>
      ctx.slots.register({ name: 'sidebar.workspaces', locale: NS }, TenantNav)),
    'ui-uicp-nav: tenant browser',
  )
  ctx.effect(
    () => ctx.slots.inject('conversation.session.header.actions', () =>
      ctx.slots.register({
        name: 'conversation.session.header.actions',
        id: 'uicp.session.switch',
        order: 100,
        locale: NS,
      }, SessionSwitchAction)),
    'ui-uicp-nav: session switch',
  )
}
