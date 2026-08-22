import { useCallback, useEffect, useState } from 'react'
import type { AppPackageKey } from '../locales.ts'
import css from './AppPackageWorkspace.module.css'
import { previewHeaders } from './sandbox-fetcher.ts'

/** Version action outcome returned by `POST /uicp/preview/version`. */
interface VersionResult {
  ok: boolean
  action: 'snapshot' | 'list' | 'restore'
  version?: string
  versions?: string[]
  restored?: number
}

/** Props for the versions seat. */
export interface VersionsPanelProps {
  /** App-package directory of the current session (its workspace cwd). */
  cwd: string
  /** Localized copy. */
  t: (key: AppPackageKey) => string
}

/**
 * M3 local version management: snapshot the package's product files into
 * `versions/`, list snapshots, and restore one over the working directory.
 * @param props - cwd and copy.
 * @returns the versions seat.
 */
export function VersionsPanel({ cwd, t }: VersionsPanelProps) {
  const [versions, setVersions] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()

  const call = useCallback(async (body: { action: string; version?: string }): Promise<VersionResult | string> => {
    try {
      const response = await fetch('/uicp/preview/version', {
        method: 'POST',
        headers: previewHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ cwd, ...body }),
      })
      const parsed = (await response.json()) as { status: number; data?: VersionResult; msg?: string }
      if (parsed.status !== 0 || parsed.data === undefined) return parsed.msg ?? 'version operation failed'
      return parsed.data
    } catch (reason) {
      return reason instanceof Error ? reason.message : String(reason)
    }
  }, [cwd])

  const refresh = useCallback(async (): Promise<void> => {
    const result = await call({ action: 'list' })
    if (typeof result === 'string') setMessage(result)
    else setVersions(result.versions ?? [])
  }, [call])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = async (): Promise<void> => {
    setBusy(true)
    setMessage(undefined)
    const result = await call({ action: 'snapshot' })
    if (typeof result === 'string') setMessage(result)
    else {
      setMessage(`${t('versions.created')}: ${result.version ?? ''}`)
      await refresh()
    }
    setBusy(false)
  }

  const restore = async (version: string): Promise<void> => {
    setBusy(true)
    setMessage(undefined)
    const result = await call({ action: 'restore', version })
    if (typeof result === 'string') setMessage(result)
    else setMessage(`${t('versions.restored')} ${result.restored ?? 0} ${t('versions.files')}`)
    setBusy(false)
  }

  return (
    <div className={css.editorRoot}>
      <div className={css.saveBar}>
        <button type="button" className={css.saveButton} disabled={busy} onClick={() => { void create() }}>
          {busy ? t('versions.creating') : t('versions.create')}
        </button>
        {message !== undefined && <span className={css.resultOk}>{message}</span>}
      </div>
      {versions.length === 0
        ? <div className={css.hint}>{t('versions.empty')}</div>
        : (
          <ul className={css.versionList}>
            {versions.map(version => (
              <li key={version} className={css.versionRow}>
                <span className={css.versionName}>{version}</span>
                <button
                  type="button"
                  className={css.versionRestore}
                  disabled={busy}
                  onClick={() => { void restore(version) }}
                >
                  {t('versions.restore')}
                </button>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}
