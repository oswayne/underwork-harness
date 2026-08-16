/** Execute generated cases against the sandbox router and assert envelopes. */

import type { SandboxRequest, SandboxResponse } from '@deepseek-ai/dsh-sandbox-server/src/types.ts'
import type { SandboxRouter } from '@deepseek-ai/dsh-sandbox-server'
import type { TestCase } from './cases.ts'

/** One case outcome; skipped cases count as passed. */
export interface CaseResult {
  name: string
  passed: boolean
  skipped?: string
  message: string
}

/**
 * Run every case through the sandbox router.
 * @param router - in-process sandbox router.
 * @param cases - generated cases.
 * @returns one outcome per case, in order.
 */
export async function runSuite(router: SandboxRouter, cases: readonly TestCase[]): Promise<CaseResult[]> {
  const results: CaseResult[] = []
  for (const test of cases) {
    if (test.skip !== undefined) {
      results.push({ name: test.name, passed: true, skipped: test.skip, message: 'skipped' })
      continue
    }
    const request: SandboxRequest = {
      method: test.method,
      path: test.path,
      query: test.query ?? {},
      body: test.body,
      session: 'apppackage_test',
    }
    const response: SandboxResponse = await router.handle(request)
    const failures: string[] = []
    if (test.expect.statusCode !== undefined && response.statusCode !== test.expect.statusCode) {
      failures.push(`statusCode ${response.statusCode} != ${test.expect.statusCode}`)
    }
    if (test.expect.status !== undefined && response.body.status !== test.expect.status) {
      failures.push(`status ${response.body.status} != ${test.expect.status}`)
    }
    if (test.expect.data !== undefined) {
      const actual = response.body.data
      if (typeof actual !== 'object' || actual === null) {
        failures.push('data 不是对象')
      } else {
        for (const [key, value] of Object.entries(test.expect.data)) {
          if ((actual as Record<string, unknown>)[key] !== value) failures.push(`data.${key} 不匹配`)
        }
      }
    }
    results.push(
      failures.length === 0
        ? { name: test.name, passed: true, message: 'ok' }
        : { name: test.name, passed: false, message: failures.join('; ') },
    )
  }
  return results
}
