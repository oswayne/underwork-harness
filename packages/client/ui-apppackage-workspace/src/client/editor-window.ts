/** Tauri core-invoke surface exposed by `withGlobalTauri: true`. */
interface TauriCoreApi {
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>
}

declare global {
  interface Window {
    __TAURI__?: { core?: TauriCoreApi }
  }
}

/**
 * Open the eureka page editor for one app-package in a dedicated window: a
 * native window created by the desktop shell's `open_editor_window` command
 * (or focused when already open), a browser popup elsewhere. The window loads
 * the standalone editor page served by the preview seam.
 * @param cwd - the app-package directory of the current session.
 * @param onError - called when the desktop shell fails to open the window.
 */
export function openEditorWindow(cwd: string, onError?: (error: unknown) => void): void {
  const url = `${window.location.origin}/uicp/editor?cwd=${encodeURIComponent(cwd)}`
  const core = window.__TAURI__?.core
  if (core !== undefined) {
    void core.invoke('open_editor_window', { url }).catch((error: unknown) => {
      console.error('uicp editor window failed to open', error)
      onError?.(error)
    })
    return
  }
  const popup = window.open(url, 'uicp-editor', 'width=1280,height=800')
  if (popup === null) onError?.(new Error('popup blocked'))
}
