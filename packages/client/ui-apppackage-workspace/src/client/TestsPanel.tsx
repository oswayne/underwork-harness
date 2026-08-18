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
  const [error, setError] = useState<string>()

  const run = async (): Promise<void> => {
    if (running) return
    setRunning(true)
    setError(undefined)
    setResult(undefined)
    try {
      const response = await fetch('/uicp/preview/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cwd }),
      })
      const body = (await response.json()) as { status: number; data?: TestResult; msg?: string }
      if (body.status !== 0 || body.data === undefined) setError(body.msg ?? 'test run failed')
      else setResult(body.data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRunning(false)
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
        {result !== undefined && (
          <span className={result.ok ? css.resultOk : css.resultError}>
            {t('tests.passed')} {result.passed}/{result.cases}
          </span>
        )}
        {error !== undefined && <span className={css.resultError}>{error}</span>}
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
