import { useEffect, useState } from 'react'
import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import {
  IconChevronDownOutline14, IconLoadingOutline16, Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
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
  const [busy, setBusy] = useState(false)
  const [veilWidth, setVeilWidth] = useState(0)

  // Mask the whole sidebar column for the entire switch, so no workspace
  // mutation is ever visible. The width comes from the layout frame's first
  // grid child (the sidebar column) via the shell overlay hook.
  useEffect(() => {
    if (!busy) return
    const layer = document.querySelector('[data-shell-overlay]')
    const sidebar = layer?.parentElement?.firstElementChild
    if (sidebar instanceof Element) setVeilWidth(sidebar.getBoundingClientRect().width)
  }, [busy])

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
    if (tenant === undefined || busy) return
    const root = packagesRoot()
    setTenantId(id)
    writeStoredTenant(id)
    selectTenant(tenant)
    setBusy(true)
    void (async () => {
      try {
        await registerApps(tenant)
        // Adopt the new tenant before dropping the old one, so a failed
        // switch leaves the previous tenant fully intact.
        if (root !== undefined) await pruneOtherTenants(root, tenant)
        setError(undefined)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
      } finally {
        setBusy(false)
      }
    })()
  }

  /** Drop app-package Workspaces of every other tenant (sessions stay open). */
  const pruneOtherTenants = async (root: string, tenant: Tenant): Promise<void> => {
    const prefix = `${root}/${tenant.identifier}/`
    await Promise.allSettled(workspaces
      .filter(workspace => workspace.path.startsWith(`${root}/`) && !workspace.path.startsWith(prefix))
      .map(workspace => deleteWorkspace(workspace.workspaceId) ?? Promise.resolve()))
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
      await pruneOtherTenants(root, effective)
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
    if (root === undefined || effective === undefined || busy) return
    void pruneOtherTenants(root, effective)
  }, [workspaces, tenants, tenantId, busy])

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
        dense
        align="start"
        side="top"
        className={css.menuRoot}
        anchor={(
          <button
            type="button"
            className={css.trigger}
            onClick={() => { setOpen(v => !v) }}
            disabled={busy}
            aria-busy={busy}
          >
            <span className={css.value}>{current?.name ?? ''}</span>
            {busy
              ? <IconLoadingOutline16 className={css.spinner} />
              : <IconChevronDownOutline14 className={css.chevron} />}
          </button>
        )}
      />
      {busy && createPortal(
        <div className={css.veil} style={{ width: veilWidth }}>
          <IconLoadingOutline16 className={css.veilSpinner} size={20} />
          <span className={css.veilText}>{t('nav.switchingTenant')}</span>
        </div>,
        document.body,
      )}
    </div>
  )
}
