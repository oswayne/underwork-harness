import { useState } from 'react'
import type { AppPackageKey } from '../locales.ts'
import { openEditorWindow } from './editor-window.ts'
import css from './AppPackageWorkspace.module.css'

/** Props for the editor seat. */
export interface EditorPanelProps {
  /** App-package directory of the current session (its workspace cwd). */
  cwd: string
  /** Localized copy. */
  t: (key: AppPackageKey) => string
}

/**
 * M3 eureka visual editor seat: opens the editor in a dedicated window (the
 * editor is a full-page tool that does not fit the chat details column), with
 * page switching and save handled inside that window.
 * @param props - cwd and copy.
 * @returns the editor seat.
 */
export function EditorPanel({ cwd, t }: EditorPanelProps) {
  const [error, setError] = useState<string>()
  const open = (): void => {
    setError(undefined)
    openEditorWindow(cwd, (reason) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }
  return (
    <div className={css.editorRoot}>
      <div className={css.saveBar}>
        <button
          type="button"
          className={css.saveButton}
          onClick={open}
        >
          {t('editor.open')}
        </button>
        <span className={css.hint}>{t('editor.inWindow')}</span>
      </div>
      {error !== undefined && <div className={css.error}>{t('editor.openFailed')}：{error}</div>}
    </div>
  )
}
