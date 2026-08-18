import type { AppPackageKey } from '../locales.ts'
import css from './AppPackageWorkspace.module.css'

/** One selectable page in the app package. */
export interface PageInfo {
  id: string
  title: string
}

/** One static-validation finding returned by the write-back seam. */
export interface ValidationIssue {
  severity: 'error' | 'warning'
  file: string
  rule: string
  message: string
}

/** Static-validation outcome of a saved page. */
export interface SaveResult {
  ok: boolean
  issues: ValidationIssue[]
}

/** Save outcome with a transport failure carried as `error`. */
export interface SaveOutcome extends SaveResult {
  error?: string
}

/**
 * Post one edited page schema through the write-back seam.
 * @param cwd - app-package directory of the current session.
 * @param page - page identifier.
 * @param value - the edited page schema.
 * @returns the validation outcome, or `{ ok: false, error }` on failure.
 */
export async function postPageSave(cwd: string, page: string, value: unknown): Promise<SaveOutcome> {
  try {
    const response = await fetch('/uicp/preview/page', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cwd, page, value }),
    })
    const body = (await response.json()) as { status: number; data?: SaveResult; msg?: string }
    if (body.status !== 0 || body.data === undefined) {
      return { ok: false, issues: [], error: body.msg ?? 'save failed' }
    }
    return body.data
  } catch (reason) {
    return { ok: false, issues: [], error: reason instanceof Error ? reason.message : String(reason) }
  }
}

/** Render the save outcome: validation findings or a failure message. */
export function SaveResultLine({
  result,
  t,
}: {
  result: SaveResult | string
  t: (key: AppPackageKey) => string
}) {
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
