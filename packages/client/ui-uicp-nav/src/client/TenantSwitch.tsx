import { useEffect, useState } from 'react'
import { useSyncExternalStore } from 'react'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { API_BASE, authSnapshot, refreshAuth, subscribeAuth } from './token.ts'
import { packagesRoot, registerAppWorkspace, resolvePackagesRoot, selectTenant } from './nav.ts'
import css from './TenantSwitch.module.css'

interface Tenant {
  _id: string
  name: string
  identifier: string
  available?: boolean
}

interface AppPackage {
  _id: string
  name: string
  identifier: string
}

/** Platform data responses omit `status` on success; missing means ok (eureka contract). */
const succeeded = (body: { status?: number }): boolean => (body.status ?? 0) === 0

/** localStorage key remembering the last selected tenant (project). */
const TENANT_KEY = 'uicp.platform.tenant'

function readStoredTenant(): string | undefined {
  try {
    return window.localStorage.getItem(TENANT_KEY) ?? undefined
  } catch {
    // Storage unavailable (non-browser environments): fall back to first tenant.
    return undefined
  }
}

function writeStoredTenant(id: string): void {
  try {
    window.localStorage.setItem(TENANT_KEY, id)
  } catch {
    // Storage unavailable: the selection still applies for this session.
  }
}

/**
 * Sidebar-foot tenant (project) switch for the dsh-integrated sidebar: picks
 * the current platform tenant and adopts every app package of that tenant as
 * a dsh Workspace (native workspace browser lists them and their sessions).
 * Apps without a local app-package directory yet are skipped until synced.
 */
export function TenantSwitch(props: PropsRuntime<'sidebar.footer.action'> & PropsLocale<'nav'>) {
  const { t, wide } = props
  const auth = useSyncExternalStore(subscribeAuth, authSnapshot)
  const token = auth.status === 'authenticated' ? auth.token : undefined
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantId, setTenantId] = useState<string | undefined>(readStoredTenant)
  const [error, setError] = useState<string | undefined>()
  const [open, setOpen] = useState(false)

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

  /** Register every app package of one tenant as a dsh Workspace. */
  const registerApps = async (tenant: Tenant): Promise<void> => {
    const root = packagesRoot()
    if (root === undefined || token === undefined) return
    const res = await fetch(`${API_BASE}/app-package/list`, {
      headers: { Authorization: token, Tenant: tenant._id },
    })
    const body = (await res.json()) as { status?: number; data?: AppPackage[]; msg?: string }
    if (!res.ok || !succeeded(body)) throw new Error(body.msg ?? `HTTP ${res.status}`)
    for (const app of body.data ?? []) {
      void registerAppWorkspace(`${root}/${tenant.identifier}/${app.identifier}`, app.name)?.catch(() => {
        // Directory not synced yet: the app appears once it exists locally.
      })
    }
  }

  const choose = (id: string): void => {
    const tenant = tenants.find(item => item._id === id)
    if (tenant === undefined) return
    setTenantId(id)
    writeStoredTenant(id)
    selectTenant(tenant)
    void registerApps(tenant).catch((reason: unknown) => { setError(String(reason)) })
  }

  // Initial selection: the stored tenant, else the first available one.
  useEffect(() => {
    if (tenants.length === 0) return
    const tenant = tenants.find(item => item._id === tenantId) ?? tenants[0]
    if (tenant === undefined) return
    if (tenantId !== tenant._id) {
      setTenantId(tenant._id)
      writeStoredTenant(tenant._id)
    }
    selectTenant(tenant)
    void registerApps(tenant).catch((reason: unknown) => { setError(String(reason)) })
  }, [tenants])

  if (token === undefined || !wide) return null
  const current = tenants.find(item => item._id === tenantId)
  return (
    <div className={css.root}>
      {error !== undefined ? <div className={css.error}>{error}</div> : null}
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={tenants.map(item => ({ id: item._id, label: item.name }))}
        selectedIds={tenantId === undefined ? [] : [tenantId]}
        onSelect={(id) => {
          setOpen(false)
          choose(id)
        }}
        portal
        dense
        align="start"
        anchor={(
          <button type="button" className={css.trigger} onClick={() => { setOpen(v => !v) }}>
            <span className={css.label}>{t('nav.tenant')}</span>
            <span className={css.value}>{current?.name ?? t('nav.tenant')}</span>
            <IconChevronDownOutline14 className={css.chevron} />
          </button>
        )}
      />
    </div>
  )
}
