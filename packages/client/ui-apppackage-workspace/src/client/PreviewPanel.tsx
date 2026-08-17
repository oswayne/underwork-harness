import { useEffect, useRef, useState } from 'react'
import type { AppPackageKey } from '../locales.ts'
import { makeFixtureFetcher, type PreviewFixtures } from './fixture-fetcher.ts'
import { loadPreviewBundle } from './preview-bundle.ts'
import css from './AppPackageWorkspace.module.css'

/** Props for the preview seat. */
export interface PreviewPanelProps {
  /** App-package directory of the current session (its workspace cwd). */
  cwd: string
  /** Localized copy. */
  t: (key: AppPackageKey) => string
}

/** One selectable page in the app package. */
interface PageInfo {
  id: string
  title: string
}

/**
 * M2 eureka preview: loads the self-contained bundle once, fetches the page
 * schema + fixtures through the preview seam, and mounts the selected page
 * (a package with several pages shows a page selector).
 * @param props - cwd and copy.
 * @returns the preview seat.
 */
export function PreviewPanel({ cwd, t }: PreviewPanelProps) {
  const host = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [error, setError] = useState<string>()
  const [pages, setPages] = useState<PageInfo[]>([])
  /** The page whose schema is currently mounted; undefined = first page. */
  const [currentPage, setCurrentPage] = useState<string>()
  /** A user-picked page waiting for its fetch to land. */
  const [wanted, setWanted] = useState<string>()

  useEffect(() => {
    const cancelled = { value: false }
    let handle: { unmount: () => void } | undefined
    const query = new URLSearchParams({ cwd })
    if (wanted !== undefined) query.set('page', wanted)
    void (async () => {
      try {
        const response = await fetch(`/uicp/preview/page?${query}`)
        const body = (await response.json()) as {
          status: number
          data?: { schema: unknown; fixtures?: PreviewFixtures; pages?: PageInfo[] }
          msg?: string
        }
        if (body.status !== 0 || body.data === undefined) {
          console.warn('uicp preview: page fetch failed', body)
          throw new Error(body.msg ?? 'preview load failed')
        }
        const api = await loadPreviewBundle()
        if (cancelled.value) return
        const container = host.current
        if (container === null) return
        handle = api.mountEurekaPreview(container, body.data.schema, {
          fetcher: makeFixtureFetcher(body.data.fixtures ?? {}),
        })
        setPages(body.data.pages ?? [])
        setCurrentPage(wanted ?? body.data.pages?.[0]?.id)
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
      handle?.unmount()
    }
  }, [cwd, wanted])

  if (status === 'error') {
    return <div className={css.error}>{error}</div>
  }
  return (
    <div className={css.preview}>
      {pages.length > 1 && (
        <div className={css.pageBar}>
          <label className={css.pageLabel} htmlFor="uicp-preview-page">{t('preview.page')}</label>
          <select
            id="uicp-preview-page"
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
      {status === 'loading' && <div className={css.loading}>{t('preview.loading')}</div>}
      <div ref={host} className={css.host} />
    </div>
  )
}
