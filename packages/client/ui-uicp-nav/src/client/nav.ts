import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'

/** One platform app-package row (identifier-scoped local record). */
export interface AppPackage {
  _id: string
  name: string
  identifier: string
}

/** Tenant row as selected from the platform list. */
export interface SelectedTenant {
  _id: string
  identifier: string
  name: string
}

/** Session actions injected by the plugin apply (context closures). */
export interface NavActions {
  openSession: (id: SessionId) => void
  createSession: (cwd: string) => Promise<void>
  renameSession: (id: SessionId, title: string) => Promise<void>
  forkSession: (id: SessionId) => void
  archiveSession: (id: SessionId) => Promise<void>
  /** Adopt an app-package directory as a dsh Workspace titled with the app name. */
  registerAppWorkspace: (cwd: string, title: string) => Promise<void>
}

/**
 * Module-local navigation state shared by the sidebar browser and the
 * conversation header switch. Platform rows carry ObjectIds only inside the
 * web session; local records never persist them.
 */
const state: {
  tenant: SelectedTenant | undefined
  app: AppPackage | undefined
  actions: NavActions | undefined
  packagesRoot: string | undefined
} = {
  tenant: undefined,
  app: undefined,
  actions: undefined,
  packagesRoot: undefined,
}

export function setNavActions(actions: NavActions): void {
  state.actions = actions
}

export function selectTenant(tenant: SelectedTenant): void {
  state.tenant = tenant
  state.app = undefined
}

export function selectApp(app: AppPackage): void {
  state.app = app
}

export function currentTenant(): SelectedTenant | undefined {
  return state.tenant
}

export function currentApp(): AppPackage | undefined {
  return state.app
}

export function openSession(id: SessionId): void {
  state.actions?.openSession(id)
}

export function createSession(cwd: string): Promise<void> | undefined {
  return state.actions?.createSession(cwd)
}

export function renameSession(id: SessionId, title: string): Promise<void> | undefined {
  return state.actions?.renameSession(id, title)
}

export function forkSession(id: SessionId): void {
  state.actions?.forkSession(id)
}

export function archiveSession(id: SessionId): Promise<void> | undefined {
  return state.actions?.archiveSession(id)
}

export function registerAppWorkspace(cwd: string, title: string): Promise<void> | undefined {
  return state.actions?.registerAppWorkspace(cwd, title)
}

export function setPackagesRoot(root: string): void {
  state.packagesRoot = root
}

/** App-packages root passed by the desktop shell through the page URL. */
function queryPackagesRoot(): string | undefined {
  try {
    const value = new URLSearchParams(window.location.search).get('uicp-app-packages-root')
    return value !== null && value !== '' ? value : undefined
  } catch {
    // Non-browser environment: no URL to parse.
    return undefined
  }
}

/**
 * Resolve the app-packages root from the shell, remembering it locally.
 * The desktop shell passes it through the page URL; the Tauri bridge is a
 * fallback for plain-browser development. A failed invoke is retried; an
 * unavailable shell leaves the root unset.
 * @returns the resolved root, or undefined when the shell is unavailable.
 */
export async function resolvePackagesRoot(): Promise<string | undefined> {
  const fromQuery = queryPackagesRoot()
  if (fromQuery !== undefined) {
    setPackagesRoot(fromQuery)
    return fromQuery
  }
  const core = window.__TAURI__?.core
  if (core !== undefined) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const root = await core.invoke('app_packages_root')
        if (typeof root === 'string' && root !== '') {
          setPackagesRoot(root)
          return root
        }
      } catch {
        // Bridge not ready yet: wait and retry below.
      }
      await new Promise(resolve => setTimeout(resolve, 300))
    }
  }
  return state.packagesRoot
}

export function packagesRoot(): string | undefined {
  return state.packagesRoot
}

/** Reset module state between tests and on logout. */
export function resetNav(): void {
  state.tenant = undefined
  state.app = undefined
  state.actions = undefined
  state.packagesRoot = undefined
}

/** Session workspace directory for one app package, when the root is known. */
export function appCwd(tenant: SelectedTenant, app: AppPackage): string | undefined {
  const root = state.packagesRoot
  return root === undefined ? undefined : `${root}/${tenant.identifier}/${app.identifier}`
}
