/**
 * Eureka visual editor mount (React 19 render adapter). The render needs a
 * browser-grade harness, so this file is excluded from unit coverage; the
 * pure edit state in `editor-state.ts` is covered separately.
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { Editor } from 'eureka-editor'
import { createEditorHandle, type EditorHandle } from './editor-state.ts'
export type { EditorHandle } from './editor-state.ts'

/** Editor mount options. */
export interface EurekaEditorEnv {
  /** Called with the edited schema when `handle.save()` runs. */
  onSave: (value: unknown) => void
  /** Preview mode (no drag/edit chrome). */
  preview?: boolean
  /** Mobile layout. */
  isMobile?: boolean
  /** Eureka docs host for help links. */
  eurekaDocHost?: string
}

/**
 * Mount the eureka visual editor over a page schema.
 * @param container - DOM node receiving the editor.
 * @param schema - initial page JSON.
 * @param env - save callback and presentation options.
 * @returns handle whose `save()` runs `onSave` with the current value and
 * whose `unmount()` tears the React root down.
 */
export function mountEurekaEditor(
  container: Element,
  schema: unknown,
  env: EurekaEditorEnv,
): EditorHandle & { unmount: () => void } {
  const root = createRoot(container)
  const handle = createEditorHandle(schema, env.onSave)
  root.render(
    React.createElement(Editor, {
      value: handle.getValue(),
      onChange: handle.setValue,
      preview: env.preview ?? false,
      isMobile: env.isMobile ?? false,
      className: 'is-fixed',
      eurekaDocHost: env.eurekaDocHost ?? 'https://aisuda.bce.baidu.com',
      eurekaEnv: {},
      showCustomRenderersPanel: true,
    }),
  )
  return { ...handle, unmount: () => { root.unmount() } }
}
