import { useEffect, useRef, useState } from 'react'
import type { AppPackageKey } from '../locales.ts'
import { loadPreviewBundle } from './preview-bundle.ts'
import css from './AppPackageWorkspace.module.css'

/** One selectable page in the app package. */
interface PageInfo {
  id: string
  title: string
}

/** One static-validation finding returned by the write-back seam. */
interface ValidationIssue {
  severity: 'error' | 'warning'
  file: string
  rule: string
  message: string
}

/** Static-validation outcome of a saved page. */
interface SaveResult {
  ok: boolean
  issues: ValidationIssue[]
}

/** Props for the editor seat. */
export interface EditorPanelProps {
  /** App-package directory of the current session (its workspace cwd). */
  cwd: string
  /** Localized copy. */
  t: (key: AppPackageKey) => string
}

/**
 * M3 eureka visual editor: loads the page schema through the workspace seam,
 * mounts the eureka editor, and writes the edited schema back to the local
 * page file with the static-validation findings shown in a status line.
 * @param props - cwd and copy.
 * @returns the editor seat.
 */
export function EditorPanel({ cwd, t }: EditorPanelProps) {
  const host = useRef<HTMLDivElement>(null)
  const handleRef = useRef<{ unmount: () => void; save: () => void }>()
  const pageRef = useRef<string>()
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [error, setError] = useState<string>()
  const [pages, setPages] = useState<PageInfo[]>([])
  const [currentPage, setCurrentPage] = useState<string>()
  const [wanted, setWanted] = useState<string>()
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [result, setResult] = useState<SaveResult | string>()

  const handleSave = async (value: unknown): Promise<void> => {
    const page = pageRef.current
    if (page === undefined || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setResult(undefined)
    try {
      const response = await fetch('/uicp/preview/page', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cwd, page, value }),
      })
      const body = (await response.json()) as { status: number; data?: SaveResult; msg?: string }
      if (body.status !== 0) setResult(`${t('editor.saveFailed')}: ${body.msg ?? ''}`)
      else setResult(body.data)
    } catch (reason) {
      setResult(`${t('editor.saveFailed')}: ${reason instanceof Error ? reason.message : String(reason)}`)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  useEffect(() => {
    const cancelled = { value: false }
    const query = new URLSearchParams({ cwd })
    if (wanted !== undefined) query.set('page', wanted)
    void (async () => {
      try {
        const response = await fetch(`/uicp/preview/page?${query}`)
        const body = (await response.json()) as {
          status: number
          data?: { schema: unknown; pages?: PageInfo[] }
          msg?: string
        }
        if (body.status !== 0 || body.data === undefined) {
          console.warn('uicp editor: page fetch failed', body)
          throw new Error(body.msg ?? 'editor load failed')
        }
        const api = await loadPreviewBundle()
        if (cancelled.value) return
        const container = host.current
        if (container === null) return
        const page = wanted ?? body.data.pages?.[0]?.id
        pageRef.current = page
        setPages(body.data.pages ?? [])
        setCurrentPage(page)
        setResult(undefined)
        handleRef.current = api.mountEurekaEditor(container, body.data.schema, {
          onSave: (value: unknown) => { void handleSave(value) },
        })
        setStatus('ready')
      } catch (reason) {
        if (!cancelled.value) {
          setError(reason instanceof Error ? reason.message : String(reason))
          setStatus('error')
        }
      }
    })()
    return () => {
      cancelled.value = true
      handleRef.current?.unmount()
      handleRef.current = undefined
    }
  }, [cwd, wanted])

  if (status === 'error') {
    return <div className={css.error}>{error}</div>
  }
  return (
    <div className={css.editorRoot}>
      {pages.length > 1 && (
        <div className={css.pageBar}>
          <label className={css.pageLabel} htmlFor="uicp-editor-page">{t('preview.page')}</label>
          <select
            id="uicp-editor-page"
            className={css.pageSelect}
            value={currentPage ?? ''}
            onChange={(event) => { setWanted(event.target.value) }}
          >
            {pages.map(page => (
              <option key={page.id} value={page.id}>{page.title}</option>
            ))}
          </select>
        </div>
      )}
      <div className={css.saveBar}>
        <button
          type="button"
          className={css.saveButton}
          disabled={saving}
          onClick={() => { handleRef.current?.save() }}
        >
          {saving ? t('editor.saving') : t('editor.save')}
        </button>
        {result !== undefined && <ResultLine result={result} t={t} />}
      </div>
      {status === 'loading' && <div className={css.loading}>{t('preview.loading')}</div>}
      <div ref={host} className={css.editorHost} />
    </div>
  )
}

/** Render the save outcome: validation findings or a failure message. */
function ResultLine({ result, t }: { result: SaveResult | string; t: (key: AppPackageKey) => string }) {
  if (typeof result === 'string') {
    return <span className={css.resultError}>{result}</span>
  }
  if (result.ok) {
    return <span className={css.resultOk}>{t('editor.saved')}</span>
  }
  const errors = result.issues.filter(item => item.severity === 'error')
  return (
    <div className={css.resultIssues}>
      <span className={css.resultError}>{t('editor.issues')}（{errors.length}）</span>
      <ul className={css.issueList}>
        {errors.slice(0, 5).map(item => (
          <li key={`${item.file}:${item.rule}`} className={css.issueError}>
            [{item.severity}] {item.file} ({item.rule}) {item.message}
          </li>
        ))}
      </ul>
    </div>
  )
}
