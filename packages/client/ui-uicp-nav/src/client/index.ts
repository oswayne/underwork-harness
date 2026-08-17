import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pull the ui-workspace Context augmentation (managedWorkspaces)
// so the guard service below typechecks against the cordis Context.
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { en, zh, type NavKey } from '../locales.ts'
import { TenantSwitch } from './TenantSwitch.tsx'
import { LoginPage } from './LoginPage.tsx'
import { SessionSwitchAction } from './SessionSwitchAction.tsx'
import { packagesRoot, setNavActions } from './nav.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    nav: NavKey
  }
}

const NS = 'nav'

/** Required services: slots for registration, locale for dictionaries. */
export const inject = ['slots', 'locale', 'sessions', 'workspaces']

/**
 * UICP navigation plugin, browser half: gates the whole frame behind a
 * dedicated sign-in page, adds a session switch header action, and provides
 * a sidebar-foot tenant switch that adopts each app package as a dsh
 * Workspace (the native workspace browser lists them and their sessions).
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
    renameSession: async (id, title) => {
      const session = ctx.sessions.binding(id)?.session
      if (session === undefined) throw new Error(`unknown session "${id}"`)
      const result = await session.rename(title)
      if (!result.ok) throw new Error(result.error.message)
    },
    forkSession: (id) => {
      ctx.sessions.fork({ sessionId: id, increaseTitle: true })
        .then((childId) => { ctx.sessions.open(childId) })
        .catch(() => {
          // Fork or child-rename failure keeps the current selection.
        })
    },
    archiveSession: async (id) => { await ctx.workspaces.archiveSession(id) },
    registerAppWorkspace: async (cwd, title) => {
      // Adopt any platform app package, creating its local directory first
      // (the from-scratch bridgehead) when it has not been synced yet.
      const tenantDir = cwd.slice(0, cwd.lastIndexOf('/'))
      const rootDir = tenantDir.slice(0, tenantDir.lastIndexOf('/'))
      const tenantName = tenantDir.slice(tenantDir.lastIndexOf('/') + 1)
      const appName = cwd.slice(cwd.lastIndexOf('/') + 1)
      await ctx.workspaces.createDirectory(rootDir, tenantName).catch(() => {
        // Parent or tenant directory already exists.
      })
      await ctx.workspaces.createDirectory(tenantDir, appName).catch(() => {
        // App directory already exists.
      })
      const workspace = await ctx.workspaces.create({ path: cwd })
      await ctx.workspaces.rename(workspace.workspaceId, title).catch(() => {
        // A title conflict with another workspace keeps the basename title.
      })
    },
    deleteWorkspace: async (workspaceId) => { await ctx.workspaces.delete(workspaceId) },
  })
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-uicp-nav: dictionaries')
  ctx.effect(
    () => ctx.reflect.provide('managedWorkspaces', {
      isManaged: (path: string) => {
        const root = packagesRoot()
        return root !== undefined && path.startsWith(`${root}/`)
      },
    }, undefined),
    'ui-uicp-nav: app-package workspace guard',
  )
  ctx.effect(
    () => ctx.slots.inject('shell.overlay', () =>
      ctx.slots.register({
        name: 'shell.overlay',
        id: 'uicp.login',
        order: 100,
        locale: NS,
      }, LoginPage)),
    'ui-uicp-nav: full-window login gate',
  )
  ctx.effect(
    () => ctx.slots.inject('sidebar.footer.action', () =>
      ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'uicp.tenant.switch',
        order: 100,
        locale: NS,
      }, TenantSwitch)),
    'ui-uicp-nav: tenant switch and app-workspace registration',
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
