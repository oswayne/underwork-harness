import { useEffect, useRef, useState } from 'react'
import type { AppPackageKey } from '../locales.ts'
import {
  PageInfo, postPageSave, SaveResult, SaveResultLine,
} from './SaveResult.tsx'
import css from './AppPackageWorkspace.module.css'

/** Props for the JSON seat. */
export interface JsonPanelProps {
  /** App-package directory of the current session (its workspace cwd). */
  cwd: string
  /** Localized copy. */
  t: (key: AppPackageKey) => string
}

/**
 * M3 JSON editor: shows the page schema as pretty-printed JSON, parses it on
 * save, and writes it back through the workspace seam with the
 * static-validation findings shown in a status line.
 * @param props - cwd and copy.
 * @returns the JSON seat.
 */
export function JsonPanel({ cwd, t }: JsonPanelProps) {
  const pageRef = useRef<string>()
  const savingRef = useRef(false)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [error, setError] = useState<string>()
  const [pages, setPages] = useState<PageInfo[]>([])
  const [currentPage, setCurrentPage] = useState<string>()
  const [wanted, setWanted] = useState<string>()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SaveResult | string>()

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
          console.warn('uicp json: page fetch failed', body)
          throw new Error(body.msg ?? 'json load failed')
        }
        if (cancelled.value) return
        const page = wanted ?? body.data.pages?.[0]?.id
        pageRef.current = page
        setPages(body.data.pages ?? [])
        setCurrentPage(page)
        setText(JSON.stringify(body.data.schema, null, 2))
        setResult(undefined)
        setStatus('ready')
      } catch (reason) {
        if (!cancelled.value) {
          setError(reason instanceof Error ? reason.message : String(reason))
          setStatus('error')
        }
      }
    })()
    return () => { cancelled.value = true }
  }, [cwd, wanted])

  const handleSave = async (): Promise<void> => {
    const page = pageRef.current
    if (page === undefined || savingRef.current) return
    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      setResult(t('json.parseError'))
      return
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)
      || (parsed as { type?: unknown }).type !== 'page') {
      setResult(t('json.pageError'))
      return
    }
    savingRef.current = true
    setSaving(true)
    setResult(undefined)
    const outcome = await postPageSave(cwd, page, parsed)
    setResult(outcome.error !== undefined ? `${t('editor.saveFailed')}: ${outcome.error}` : outcome)
    savingRef.current = false
    setSaving(false)
  }

  if (status === 'error') {
    return <div className={css.error}>{error}</div>
  }
  return (
    <div className={css.editorRoot}>
      {pages.length > 1 && (
        <div className={css.pageBar}>
          <label className={css.pageLabel} htmlFor="uicp-json-page">{t('preview.page')}</label>
          <select
            id="uicp-json-page"
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
          onClick={() => { void handleSave() }}
        >
          {saving ? t('editor.saving') : t('editor.save')}
        </button>
        {result !== undefined && <SaveResultLine result={result} t={t} />}
      </div>
      {status === 'loading' && <div className={css.loading}>{t('preview.loading')}</div>}
      <textarea
        className={css.jsonInput}
        value={text}
        onChange={(event) => { setText(event.target.value) }}
        spellCheck={false}
      />
    </div>
  )
}
