import { useEffect, useState } from 'react'
import { useSyncExternalStore } from 'react'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { API_BASE, authSnapshot, refreshAuth, subscribeAuth } from './token.ts'
import {
  deleteWorkspace, packagesRoot, registerAppWorkspace, resolvePackagesRoot, selectTenant,
} from './nav.ts'
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
  const workspaces = props.useWorkspaces(s => s.items)
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

  /**
   * Register every app package of one tenant as a dsh Workspace.
   * @returns how many app packages were registered (missing local dirs skip).
   * @throws when the root is unavailable or a real registration error occurs.
   */
  const registerApps = async (tenant: Tenant): Promise<number> => {
    if (token === undefined) return 0
    const root = packagesRoot() ?? await resolvePackagesRoot()
    if (root === undefined) throw new Error(t('nav.rootMissing'))
    const res = await fetch(`${API_BASE}/app-package/list`, {
      headers: { Authorization: token, Tenant: tenant._id },
    })
    const body = (await res.json()) as { status?: number; data?: AppPackage[]; msg?: string }
    if (!res.ok || !succeeded(body)) throw new Error(body.msg ?? `HTTP ${res.status}`)
    const apps = body.data ?? []
    let registered = 0
    const failures: string[] = []
    for (const app of apps) {
      const pending = registerAppWorkspace(`${root}/${tenant.identifier}/${app.identifier}`, app.name)
      if (pending === undefined) continue
      try {
        await pending
        registered += 1
      } catch (reason) {
        failures.push(reason instanceof Error ? reason.message : String(reason))
      }
    }
    if (apps.length > 0 && registered === 0) {
      console.warn('uicp-nav: app workspace registration failed', failures)
      throw new Error(`${t('nav.rootUnavailable', { root })}：${failures[0] ?? ''}`)
    }
    return registered
  }

  const choose = (id: string): void => {
    const tenant = tenants.find(item => item._id === id)
    if (tenant === undefined) return
    const root = packagesRoot()
    if (root !== undefined) pruneOtherTenants(root, tenant)
    setTenantId(id)
    writeStoredTenant(id)
    selectTenant(tenant)
    void registerApps(tenant).then(() => {
      setError(undefined)
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  /** Drop app-package Workspaces of every other tenant (sessions stay open). */
  const pruneOtherTenants = (root: string, tenant: Tenant): void => {
    const prefix = `${root}/${tenant.identifier}/`
    for (const workspace of workspaces) {
      if (workspace.path.startsWith(`${root}/`) && !workspace.path.startsWith(prefix)) {
        void deleteWorkspace(workspace.workspaceId)?.catch(() => {
          // The workspace may already be gone.
        })
      }
    }
  }

  // Initial pass: land on the stored tenant (else the first), register only
  // its app packages, and prune the other tenants' app-package Workspaces.
  useEffect(() => {
    if (tenants.length === 0) return
    void (async () => {
      const root = packagesRoot() ?? await resolvePackagesRoot()
      if (root === undefined) {
        setError(t('nav.rootMissing'))
        return
      }
      const effective = tenants.find(item => item._id === tenantId) ?? tenants[0]
      if (effective !== undefined) {
        if (tenantId === undefined || !tenants.some(item => item._id === tenantId)) {
          setTenantId(effective._id)
          writeStoredTenant(effective._id)
        }
        selectTenant(effective)
      }
      if (effective === undefined) return
      pruneOtherTenants(root, effective)
      try {
        await registerApps(effective)
        setError(undefined)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
      }
    })()
  }, [tenants])

  // Keep the browser scoped to the current tenant as the workspace list
  // settles (registration/removal frames arrive after the initial pass).
  useEffect(() => {
    const root = packagesRoot()
    const effective = tenants.find(item => item._id === tenantId)
    if (root === undefined || effective === undefined) return
    pruneOtherTenants(root, effective)
  }, [workspaces, tenants, tenantId])

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
        side="top"
        className={css.menuRoot}
        anchor={(
          <button type="button" className={css.trigger} onClick={() => { setOpen(v => !v) }}>
            <span className={css.value}>{current?.name ?? ''}</span>
            <IconChevronDownOutline14 className={css.chevron} />
          </button>
        )}
      />
    </div>
  )
}
