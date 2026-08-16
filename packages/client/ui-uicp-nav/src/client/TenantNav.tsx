import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { clearToken, getToken, API_BASE } from './token.ts'
import { AppPackage, SelectedTenant, appCwd, createSession, openSession, resolvePackagesRoot, selectApp, selectTenant } from './nav.ts'
import { LoginView } from './LoginView.tsx'

interface Tenant {
  _id: string
  name: string
  identifier: string
  available?: boolean
}

/**
 * Tenant/app/session browser occupying the sidebar browsing region: signs in
 * with a JWT, lists available tenants and their app packages, then shows the
 * sessions of the selected app package (grouped by workspace cwd) and opens
 * one on click. Session creation through the workspace path lands separately.
 */
export function TenantNav(props: PropsRuntime<'sidebar.workspaces'> & PropsLocale<'nav'>) {
  const { t } = props
  const list = props.useSessions(s => s)
  const [token, setTok] = useState<string | undefined>()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [apps, setApps] = useState<AppPackage[]>([])
  const [tenant, setTenant] = useState<SelectedTenant | undefined>()
  const [app, setApp] = useState<AppPackage | undefined>()
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    void getToken().then(setTok)
    void resolvePackagesRoot()
  }, [])

  useEffect(() => {
    if (token === undefined) return
    const cancelled = { value: false }
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/systemctl/tenant/list`, {
          headers: { Authorization: token },
        })
        const body = (await res.json()) as { status?: number; data?: Tenant[]; msg?: string }
        if (body.status !== 0) throw new Error(body.msg ?? `status ${String(body.status)}`)
        if (!cancelled.value) {
          setTenants((body.data ?? []).filter(item => item.available !== false))
          setError(undefined)
        }
      } catch (err) {
        if (!cancelled.value) setError(String(err))
      }
    })()
    return () => {
      cancelled.value = true
    }
  }, [token])

  const loadApps = async (tenant: Tenant): Promise<void> => {
    const selected = { _id: tenant._id, identifier: tenant.identifier, name: tenant.name }
    selectTenant(selected)
    setTenant(selected)
    setApp(undefined)
    setError(undefined)
    try {
      const tokenValue = token ?? ''
      const res = await fetch(`${API_BASE}/app-package/list`, {
        headers: { Authorization: tokenValue, Tenant: tenant._id },
      })
      const body = (await res.json()) as { status?: number; data?: AppPackage[]; msg?: string }
      if (body.status !== 0) throw new Error(body.msg ?? `status ${String(body.status)}`)
      setApps(body.data ?? [])
    } catch (err) {
      setError(String(err))
    }
  }

  const cwd = tenant !== undefined && app !== undefined ? appCwd(tenant, app) : undefined
  const sessions = cwd === undefined
    ? []
    : list.ids
      .map(id => list.byId[id])
      .filter((row): row is NonNullable<typeof row> => row !== undefined)
      .filter(row => row.cwd === cwd)

  if (token === undefined) return <LoginView t={t} />
  return (
    <div>
      <h3>{t('nav.tenants')}</h3>
      {error !== undefined ? <div>{error}</div> : null}
      {tenant === undefined ? (
        <ul>
          {tenants.map(item => (
            <li key={item._id}>
              <button type="button" onClick={() => void loadApps(item)}>
                {item.name}（{item.identifier}）
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <h4>{t('nav.apps')}</h4>
          <ul>
            {apps.map(item => (
              <li key={item._id}>
                <button
                  type="button"
                  onClick={() => {
                    selectApp(item)
                    setApp(item)
                  }}
                  disabled={app?.identifier === item.identifier}
                >
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
          {app !== undefined ? (
            <>
              <h4>{t('nav.sessions')}</h4>
              {cwd !== undefined ? (
                <button type="button" onClick={() => void createSession(cwd)}>
                  {t('nav.newSession')}
                </button>
              ) : null}
              <ul>
                {sessions.map(row => (
                  <li key={row.id}>
                    <button type="button" onClick={() => { openSession(row.id) }}>
                      {row.displayTitle}
                    </button>
                  </li>
                ))}
                {sessions.length === 0 ? <li>{t('nav.empty')}</li> : null}
              </ul>
            </>
          ) : null}
        </>
      )}
      <button
        type="button"
        onClick={() => {
          void clearToken().then(() => { setTok(undefined) })
        }}
      >
        {t('nav.logout')}
      </button>
    </div>
  )
}
