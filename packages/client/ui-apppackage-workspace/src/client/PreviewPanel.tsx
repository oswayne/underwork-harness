import { useEffect, useRef, useState } from 'react'
import type { AppPackageKey } from '../locales.ts'
import { makeFixtureFetcher, type PreviewFixtures } from './fixture-fetcher.ts'
import css from './AppPackageWorkspace.module.css'

declare global {
  interface Window {
    UicpEurekaPreview?: {
      mountEurekaPreview: (
        container: Element,
        schema: unknown,
        env: { fetcher: (request: { url: string; method: string; data?: unknown }) => Promise<unknown> },
      ) => { unmount: () => void }
    }
  }
}

/** Props for the preview seat. */
export interface PreviewPanelProps {
  /** App-package directory of the current session (its workspace cwd). */
  cwd: string
  /** Optional page identifier; omitted picks the first page in the package. */
  page?: string
  /** Localized copy. */
  t: (key: AppPackageKey) => string
}

/**
 * M2 eureka preview: loads the self-contained bundle once, fetches the page
 * schema + fixtures through the preview seam, and mounts the page.
 * @param props - cwd, optional page id, and copy.
 * @returns the preview seat.
 */
export function PreviewPanel({ cwd, page, t }: PreviewPanelProps) {
  const host = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [error, setError] = useState<string>()

  useEffect(() => {
    const cancelled = { value: false }
    let handle: { unmount: () => void } | undefined
    const query = new URLSearchParams({ cwd })
    if (page !== undefined) query.set('page', page)
    void (async () => {
      try {
        const response = await fetch(`/uicp/preview/page?${query}`)
        const body = (await response.json()) as {
          status: number
          data?: { schema: unknown; fixtures?: PreviewFixtures }
          msg?: string
        }
        if (body.status !== 0 || body.data === undefined) {
          throw new Error(body.msg ?? 'preview load failed')
        }
        const api = await loadPreviewBundle()
        if (cancelled.value) return
        const container = host.current
        if (container === null) return
        handle = api.mountEurekaPreview(container, body.data.schema, {
          fetcher: makeFixtureFetcher(body.data.fixtures ?? {}),
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
      handle?.unmount()
    }
  }, [cwd, page])

  if (status === 'error') {
    return <div className={css.error}>{error}</div>
  }
  return (
    <div className={css.preview}>
      {status === 'loading' && <div className={css.loading}>{t('preview.loading')}</div>}
      <div ref={host} className={css.host} />
    </div>
  )
}

/**
 * Inject the preview bundle stylesheet and script once; resolves with the
 * bundle API once it is exposed.
 */
function loadPreviewBundle(): Promise<NonNullable<Window['UicpEurekaPreview']>> {
  return new Promise((resolve, reject) => {
    const ready = (): void => {
      const api = window.UicpEurekaPreview
      if (api !== undefined) resolve(api)
      else reject(new Error('preview bundle did not expose UicpEurekaPreview'))
    }
    if (window.UicpEurekaPreview !== undefined) {
      resolve(window.UicpEurekaPreview)
      return
    }
    const existing = document.querySelector('script[data-uicp-preview]')
    if (existing !== null && existing instanceof HTMLScriptElement) {
      existing.addEventListener('load', () => { ready() }, { once: true })
      return
    }
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = '/uicp/preview/bundle.css'
    css.dataset.uicpPreview = ''
    document.head.appendChild(css)
    const script = document.createElement('script')
    script.src = '/uicp/preview/bundle.js'
    script.dataset.uicpPreview = ''
    script.addEventListener('load', () => { ready() }, { once: true })
    script.addEventListener('error', () => {
      reject(new Error('preview bundle failed to load'))
    }, { once: true })
    document.head.appendChild(script)
  })
}
