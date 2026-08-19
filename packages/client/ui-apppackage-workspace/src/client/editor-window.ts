/**
 * Open the eureka page editor for one app-package in a dedicated browser
 * window: a popup named `uicp-editor` (focused when already open). The window
 * loads the standalone editor page served by the preview seam.
 * @param cwd - the app-package directory of the current session.
 * @param onError - called when the popup is blocked.
 */
export function openEditorWindow(cwd: string, onError?: (error: unknown) => void): void {
  const url = `${window.location.origin}/uicp/editor?cwd=${encodeURIComponent(cwd)}`
  const popup = window.open(url, 'uicp-editor', 'width=1280,height=800')
  if (popup === null) onError?.(new Error('popup blocked'))
}
