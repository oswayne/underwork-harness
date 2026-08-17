import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { AppPackageWorkspace, type AppPackageWorkspaceInjected } from './AppPackageWorkspace.tsx'
import { PreviewAction, type PreviewActionInjected } from './PreviewAction.tsx'
import { en, zh, type AppPackageKey } from '../locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    apppackage: AppPackageKey
  }
}

const NS = 'apppackage'

/** Required services: slots for registration, locale for dictionaries. */
export const inject = ['slots', 'locale', 'sessions', 'layout']

/**
 * App-package product workspace, browser half: replaces the upstream details
 * seat with a tabbed surface whose preview tab mounts the self-contained
 * eureka bundle over the current session's app-package directory.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-apppackage-workspace: dictionaries')
  ctx.effect(
    () => ctx.slots.inject('details', () =>
      ctx.slots.register({
        name: 'details',
        // Single-slot shadowing is ascending priority: -100 renders over the
        // upstream DetailsPanel (default 0) without upstream edits.
        priority: -100,
        locale: NS,
        inject: (): AppPackageWorkspaceInjected => ({
          closeDetails: () => { ctx.layout.closeDetails() },
        }),
      }, AppPackageWorkspace)),
    'ui-apppackage-workspace: details workspace',
  )
  ctx.effect(
    () => ctx.slots.inject('conversation.session.header.utilities', () =>
      ctx.slots.register({
        name: 'conversation.session.header.utilities',
        id: 'uicp.apppackage.preview',
        order: 100,
        locale: NS,
        inject: (): PreviewActionInjected => ({
          openDetails: () => { ctx.layout.openDetails() },
        }),
      }, PreviewAction)),
    'ui-apppackage-workspace: preview header action',
  )
}
