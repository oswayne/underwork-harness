import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { appCwd, currentApp, currentTenant, openSession } from './nav.ts'

/** Session switch entry in the conversation header action row. */
export function SessionSwitchAction(props: PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'nav'>) {
  const { t } = props
  const list = props.useSessions(s => s)
  const current = list.current === undefined ? undefined : list.byId[list.current]
  const tenant = currentTenant()
  const app = currentApp()
  const cwd = tenant !== undefined && app !== undefined ? appCwd(tenant, app) : current?.cwd
  const sessions = cwd === undefined
    ? []
    : list.ids
      .map(id => list.byId[id])
      .filter((row): row is NonNullable<typeof row> => row !== undefined)
      .filter(row => row.cwd === cwd)
  return (
    <select
      aria-label={t('nav.sessions')}
      value={current?.id ?? ''}
      onChange={(event) => {
        const id = event.target.value
        if (id !== '') openSession(id as SessionId)
      }}
    >
      <option value="" disabled>{t('nav.sessions')}</option>
      {sessions.map(row => (
        <option key={row.id} value={row.id}>{row.displayTitle}</option>
      ))}
    </select>
  )
}
