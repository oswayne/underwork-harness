import { useState } from 'react'
import type { AppPackageKey } from '../locales.ts'
import css from './AppPackageWorkspace.module.css'

/** One generated case outcome from the workspace test seam. */
interface CaseResult {
  name: string
  passed: boolean
  skipped?: string
  message: string
}

/** Test-suite outcome returned by `POST /uicp/preview/test`. */
interface TestResult {
  ok: boolean
  cases: number
  passed: number
  failed: number
  results: CaseResult[]
}

/** Props for the tests seat. */
export interface TestsPanelProps {
  /** App-package directory of the current session (its workspace cwd). */
  cwd: string
  /** Localized copy. */
  t: (key: AppPackageKey) => string
}

/**
 * M3 automated tests: runs the generated positive/negative/boundary suite
 * against the local sandbox through the workspace seam and lists each case.
 * @param props - cwd and copy.
 * @returns the tests seat.
 */
export function TestsPanel({ cwd, t }: TestsPanelProps) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<TestResult>()
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean }>()
  const [confirming, setConfirming] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const run = async (): Promise<void> => {
    if (running) return
    setRunning(true)
    setFeedback(undefined)
    setResult(undefined)
    try {
      const response = await fetch('/uicp/preview/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cwd }),
      })
      const body = (await response.json()) as { status: number; data?: TestResult; msg?: string }
      if (body.status !== 0 || body.data === undefined) setFeedback({ text: body.msg ?? 'test run failed', ok: false })
      else {
        setResult(body.data)
        setConfirming(false)
      }
    } catch (reason) {
      setFeedback({ text: reason instanceof Error ? reason.message : String(reason), ok: false })
    } finally {
      setRunning(false)
    }
  }

  const publish = async (): Promise<void> => {
    if (publishing) return
    if (!confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    setPublishing(true)
    setFeedback(undefined)
    let token: string | undefined
    let tenantId: string | undefined
    try {
      token = window.localStorage.getItem('uicp.platform.token') ?? undefined
      tenantId = window.localStorage.getItem('uicp.platform.tenant') ?? undefined
    } catch {
      // Storage unavailable: the auth checks below fail with the missing-auth copy.
    }
    if (token === undefined || tenantId === undefined) {
      setFeedback({ text: t('publish.missingAuth'), ok: false })
      setPublishing(false)
      return
    }
    try {
      const response = await fetch('/uicp/preview/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cwd, token, tenantId, adopted: true }),
      })
      const body = (await response.json()) as {
        status: number
        data?: { ok: boolean; appId: string; created: Record<string, number | boolean> }
        msg?: string
      }
      if (body.status !== 0 || body.data === undefined) {
        setFeedback({ text: `${t('publish.failed')}: ${body.msg ?? ''}`, ok: false })
      } else {
        const created = body.data.created
        setFeedback({
          text: `${t('publish.saved')} app=${body.data.appId} `
            + `created: app=${created.app} entities=${created.entities} fields=${created.fields} `
            + `funcs=${created.funcs} menu=${created.menu} page=${created.page}`,
          ok: true,
        })
      }
    } catch (reason) {
      setFeedback({ text: `${t('publish.failed')}: ${reason instanceof Error ? reason.message : String(reason)}`, ok: false })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className={css.editorRoot}>
      <div className={css.saveBar}>
        <button
          type="button"
          className={css.saveButton}
          disabled={running}
          onClick={() => { void run() }}
        >
          {running ? t('tests.running') : t('tests.run')}
        </button>
        {result?.ok === true && (
          <button
            type="button"
            className={css.publishButton}
            disabled={publishing}
            onClick={() => { void publish() }}
          >
            {publishing ? t('publish.saving') : confirming ? t('publish.confirm') : t('publish.save')}
          </button>
        )}
        {result !== undefined && (
          <span className={result.ok ? css.resultOk : css.resultError}>
            {t('tests.passed')} {result.passed}/{result.cases}
          </span>
        )}
        {feedback !== undefined && (
          <span className={feedback.ok ? css.resultOk : css.resultError}>{feedback.text}</span>
        )}
      </div>
      {result !== undefined && (
        <ul className={css.testList}>
          {result.results.map(item => (
            <li key={item.name} className={item.skipped !== undefined ? css.testSkip : item.passed ? css.testPass : css.testFail}>
              <span className={css.testMarker}>
                {item.skipped !== undefined ? t('tests.skipped') : item.passed ? t('tests.passed') : t('tests.failed')}
              </span>
              {' '}{item.name}
              {item.passed && item.message !== 'ok' ? ` — ${item.message}` : ''}
              {!item.passed ? ` — ${item.message}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
