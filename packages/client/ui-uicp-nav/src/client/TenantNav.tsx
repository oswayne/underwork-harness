import { useEffect, useState } from 'react'
import { useSyncExternalStore } from 'react'
import {
  Button, IconFolderClose16, IconFolderOpen16, IconPlusOutline16,
  IconTriangleRightFill14, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { API_BASE, authSnapshot, clearToken, refreshAuth, subscribeAuth } from './token.ts'
import {
  type AppPackage, type SelectedTenant, appCwd, createSession, openSession,
  packagesRoot, resolvePackagesRoot, selectApp, selectTenant,
} from './nav.ts'
import css from './TenantNav.module.css'

interface Tenant {
  _id: string
  name: string
  identifier: string
  available?: boolean
}

/** Platform data responses omit `status` on success; missing means ok (eureka contract). */
const succeeded = (body: { status?: number }): boolean => (body.status ?? 0) === 0

/** Compact relative time ("刚刚"/"5分钟"), same buckets as the dsh browser rows. */
function relativeTime(updatedAt: number, now: number): { unit: 'now' | 'minutes' | 'hours' | 'days' | 'months' | 'years'; n: number } {
  const MIN = 60_000
  const HOUR = 3_600_000
  const DAY = 86_400_000
  const diff = Math.max(0, now - updatedAt)
  if (diff < MIN) return { unit: 'now', n: 0 }
  if (diff < HOUR) return { unit: 'minutes', n: Math.floor(diff / MIN) }
  if (diff < DAY) return { unit: 'hours', n: Math.floor(diff / HOUR) }
  if (diff < 30 * DAY) return { unit: 'days', n: Math.floor(diff / DAY) }
  if (diff < 365 * DAY) return { unit: 'months', n: Math.floor(diff / (30 * DAY)) }
  return { unit: 'years', n: Math.floor(diff / (365 * DAY)) }
}

/**
 * Tenant/app/session tree occupying the sidebar browsing region: signs in
 * with a JWT, then lists every available tenant (project) as a folder root.
 * Expanding a project lazily loads its app packages; expanding an app package
 * shows the sessions bound to its workspace directory (opened on click).
 * Row chrome mirrors the dsh workspace browser (folder rows with a hover
 * chevron swap, 32px session rows, 22px indent steps).
 */
export function TenantNav(props: PropsRuntime<'sidebar.workspaces'> & PropsLocale<'nav'>) {
  const { t } = props
  const list = props.useSessions(s => s)
  const auth = useSyncExternalStore(subscribeAuth, authSnapshot)
  const token = auth.status === 'authenticated' ? auth.token : undefined
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [appsByTenant, setAppsByTenant] = useState<Record<string, AppPackage[]>>({})
  const [expandedTenants, setExpandedTenants] = useState<string[]>([])
  const [expandedApps, setExpandedApps] = useState<string[]>([])
  const [appsLoading, setAppsLoading] = useState<string | undefined>()
  const [appErrors, setAppErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | undefined>()
  const [context, setContext] = useState<{ tenant: SelectedTenant; app: AppPackage } | undefined>()

  useEffect(() => {
    refreshAuth()
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
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        if (!succeeded(body)) throw new Error(body.msg ?? '平台请求失败')
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
    if (appsByTenant[tenant._id] !== undefined || appsLoading === tenant._id) return
    setAppsLoading(tenant._id)
    setAppErrors(errors => Object.fromEntries(
      Object.entries(errors).filter(([key]) => key !== tenant._id),
    ))
    try {
      const res = await fetch(`${API_BASE}/app-package/list`, {
        headers: { Authorization: token ?? '', Tenant: tenant._id },
      })
      const body = (await res.json()) as { status?: number; data?: AppPackage[]; msg?: string }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (!succeeded(body)) throw new Error(body.msg ?? '平台请求失败')
      setAppsByTenant(apps => ({ ...apps, [tenant._id]: body.data ?? [] }))
    } catch (err) {
      setAppErrors(errors => ({ ...errors, [tenant._id]: String(err) }))
    } finally {
      setAppsLoading(undefined)
    }
  }

  /** Remember the current tenant/app context (module state + row highlight). */
  const select = (tenant: SelectedTenant, app: AppPackage): void => {
    selectTenant(tenant)
    selectApp(app)
    setContext({ tenant, app })
  }

  const toggleTenant = (tenant: Tenant): void => {
    if (expandedTenants.includes(tenant._id)) {
      setExpandedTenants(keys => keys.filter(key => key !== tenant._id))
    } else {
      setExpandedTenants(keys => [...keys, tenant._id])
      if (appsByTenant[tenant._id] === undefined) void loadApps(tenant)
    }
  }

  const toggleApp = (tenant: Tenant, app: AppPackage): void => {
    select(tenant, app)
    const key = `${tenant._id}/${app.identifier}`
    setExpandedApps(keys => keys.includes(key)
      ? keys.filter(item => item !== key)
      : [...keys, key])
  }

  const open = (id: SessionId): void => {
    openSession(id)
    const row = list.byId[id]
    const cwd = row?.cwd
    const root = packagesRoot()
    if (cwd === undefined || root === undefined || !cwd.startsWith(`${root}/`)) return
    const [tenantId, appId] = cwd.slice(root.length + 1).split('/')
    if (tenantId === undefined || appId === undefined) return
    const tenant = tenants.find(item => item.identifier === tenantId)
    const app = tenant === undefined
      ? undefined
      : (appsByTenant[tenant._id] ?? []).find(item => item.identifier === appId)
    if (tenant !== undefined && app !== undefined) select(tenant, app)
  }

  const create = (tenant: Tenant, app: AppPackage): void => {
    const cwd = appCwd(tenant, app)
    if (cwd === undefined) return
    select(tenant, app)
    setExpandedApps(keys => keys.includes(`${tenant._id}/${app.identifier}`)
      ? keys
      : [...keys, `${tenant._id}/${app.identifier}`])
    void createSession(cwd)
  }

  if (token === undefined) return null
  const now = Date.now()
  return (
    <div className={css.root}>
      <h3 className={css.sectionHeader}>{t('nav.projects')}</h3>
      {error !== undefined ? <div className={css.error}>{error}</div> : null}
      <div className={css.tree} role="tree" aria-label={t('nav.projects')}>
        {tenants.map((tenant) => {
          const tenantOpen = expandedTenants.includes(tenant._id)
          const apps = appsByTenant[tenant._id] ?? []
          const loading = appsLoading === tenant._id
          const appError = appErrors[tenant._id]
          return (
            <div key={tenant._id} className={css.group}>
              <div
                className={css.projectRow}
                role="treeitem"
                aria-expanded={tenantOpen}
                onClick={() => { toggleTenant(tenant) }}
              >
                <span className={[css.slot, css.folder].join(' ')}>
                  {tenantOpen ? <IconFolderOpen16 /> : <IconFolderClose16 />}
                </span>
                <span className={[css.slot, css.chevron].join(' ')}>
                  <IconTriangleRightFill14 className={[css.arrow, tenantOpen && css.arrowOpen].filter(Boolean).join(' ')} />
                </span>
                <span className={css.title}>{tenant.name}</span>
              </div>
              {tenantOpen && (
                <div role="group" className={css.group}>
                  {loading ? <div className={css.empty}>{t('nav.loading')}</div> : null}
                  {appError !== undefined ? <div className={css.error}>{appError}</div> : null}
                  {apps.map((app) => {
                    const key = `${tenant._id}/${app.identifier}`
                    const appOpen = expandedApps.includes(key)
                    const cwd = appCwd(tenant, app)
                    const sessions = cwd === undefined
                      ? []
                      : list.ids
                        .map(id => list.byId[id])
                        .filter((row): row is NonNullable<typeof row> => row !== undefined)
                        .filter(row => row.cwd === cwd)
                    const active = context?.tenant._id === tenant._id
                      && context.app.identifier === app.identifier
                    return (
                      <div key={key} className={css.group}>
                        <div
                          className={[css.projectRow, css.appRow, active && css.selected].filter(Boolean).join(' ')}
                          role="treeitem"
                          aria-expanded={appOpen}
                          onClick={() => { toggleApp(tenant, app) }}
                        >
                          <span className={[css.slot, css.folder].join(' ')}>
                            {appOpen ? <IconFolderOpen16 /> : <IconFolderClose16 />}
                          </span>
                          <span className={[css.slot, css.chevron].join(' ')}>
                            <IconTriangleRightFill14 className={[css.arrow, appOpen && css.arrowOpen].filter(Boolean).join(' ')} />
                          </span>
                          <span className={css.title}>{app.name}</span>
                          {cwd !== undefined && (
                            <span className={css.rowActions}>
                              <button
                                type="button"
                                className={css.iconButton}
                                aria-label={t('nav.newSession')}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  create(tenant, app)
                                }}
                              >
                                <IconPlusOutline16 />
                              </button>
                            </span>
                          )}
                        </div>
                        {appOpen && (
                          <div role="group" className={css.group}>
                            {sessions.map((row) => {
                              const selected = row.id === list.current
                              const { unit, n } = relativeTime(row.updatedAt, now)
                              const time = unit === 'now' ? t('time.now') : t(`time.${unit}`, { n })
                              const dot = row.pendingInteraction !== undefined
                                ? <StateDot state="warning" />
                                : row.running
                                  ? <StateDot state="ongoing" />
                                  : row.completed === true
                                    ? <StateDot state="done" />
                                    : null
                              return (
                                <div
                                  key={row.id}
                                  className={[css.sessionRow, selected && css.selected].filter(Boolean).join(' ')}
                                  role="treeitem"
                                  aria-selected={selected}
                                  onClick={() => { open(row.id) }}
                                >
                                  <span className={css.slot}>{dot}</span>
                                  <span className={css.title}>{row.displayTitle}</span>
                                  <span className={css.time}>{time}</span>
                                </div>
                              )
                            })}
                            {sessions.length === 0 ? <div className={css.empty}>{t('nav.empty')}</div> : null}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {!loading && appError === undefined && apps.length === 0
                    ? <div className={css.empty}>{t('nav.empty')}</div>
                    : null}
                </div>
              )}
            </div>
          )
        })}
        {tenants.length === 0 ? <div className={css.empty}>{t('nav.empty')}</div> : null}
      </div>
      <div className={css.footer}>
        <Button
          variant="ghost"
          size="sm"
          className={css.logout}
          onClick={() => {
            void clearToken()
          }}
        >
          {t('nav.logout')}
        </Button>
      </div>
    </div>
  )
}
