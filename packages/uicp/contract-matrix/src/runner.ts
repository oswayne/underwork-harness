/** Run the matrix corpus against any request/response target and compare two targets. */

import type { MatrixCase } from './matrix.ts'

/** Minimal request/response surface shared by the sandbox router and HTTP targets. */
export interface MatrixRequest {
  method: string
  path: string
  query: Record<string, string>
  body?: Record<string, unknown>
}

export interface MatrixResponse {
  statusCode: number
  body: { status: number; msg: string; data: unknown }
}

/** One case outcome. */
export interface MatrixResult {
  name: string
  passed: boolean
  message: string
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (typeof left === 'object' && left !== null && typeof right === 'object' && right !== null) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    return leftKeys.length === rightKeys.length
      && leftKeys.every(key => deepEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]))
  }
  return false
}

/** Evaluate partial `data` expectations across object, array, and scalar shapes. */
function matchesData(actual: unknown, expected: Record<string, unknown> | null): string | null {
  if (expected === null) return actual === null ? null : 'data 应为 null'
  if (Array.isArray(actual)) {
    for (const [key, value] of Object.entries(expected)) {
      if (key === 'length' && actual.length !== Number(value)) return `data.length ${actual.length} != ${String(value)}`
      if (key === 'firstAmount' && (actual[0] as Record<string, unknown> | undefined)?.amount !== value) return 'data[0].amount 不匹配'
      if (key === 'firstName' && (actual[0] as Record<string, unknown> | undefined)?.name !== value) return 'data[0].name 不匹配'
    }
    return null
  }
  if (typeof actual === 'object' && actual !== null) {
    for (const [key, value] of Object.entries(expected)) {
      if (!deepEqual((actual as Record<string, unknown>)[key], value)) {
        return `data.${key} 不匹配`
      }
    }
    return null
  }
  for (const value of Object.values(expected)) {
    if (value !== undefined && !deepEqual(actual, value)) return 'data 标量不匹配'
  }
  return null
}

/**
 * Run every matrix case against a target.
 * @param target - request handler returning platform-shaped responses.
 * @param cases - the corpus.
 * @param resolvePlaceholders - replace `id-placeholder` / `tree-root-id` with concrete ids when needed.
 * @returns one outcome per case.
 */
export async function runMatrix(
  target: (request: MatrixRequest) => Promise<MatrixResponse>,
  cases: readonly MatrixCase[],
  resolvePlaceholders: (path: string) => string = path => path,
): Promise<MatrixResult[]> {
  const results: MatrixResult[] = []
  for (const test of cases) {
    const request: MatrixRequest = { method: test.method, path: resolvePlaceholders(test.path), query: test.query ?? {} }
    if (test.body !== undefined) request.body = test.body
    const response = await target(request)
    const failures: string[] = []
    const expectedStatus = test.status ?? 200
    if (response.statusCode !== expectedStatus) failures.push(`statusCode ${response.statusCode} != ${expectedStatus}`)
    if (test.data !== undefined) {
      const mismatch = matchesData(response.body.data, test.data)
      if (mismatch !== null) failures.push(mismatch)
    }
    results.push(failures.length === 0 ? { name: test.name, passed: true, message: 'ok' } : { name: test.name, passed: false, message: failures.join('; ') })
  }
  return results
}

/** Compare two targets on the same corpus; returns per-case divergences. */
export async function diffMatrix(
  left: (request: MatrixRequest) => Promise<MatrixResponse>,
  right: (request: MatrixRequest) => Promise<MatrixResponse>,
  cases: readonly MatrixCase[],
  resolvePlaceholders: (path: string) => string = path => path,
): Promise<{ name: string; left: MatrixResult; right: MatrixResult }[]> {
  const leftResults = await runMatrix(left, cases, resolvePlaceholders)
  const rightResults = await runMatrix(right, cases, resolvePlaceholders)
  const divergences: { name: string; left: MatrixResult; right: MatrixResult }[] = []
  for (let index = 0; index < cases.length; index += 1) {
    const leftResult = leftResults[index] as MatrixResult
    const rightResult = rightResults[index] as MatrixResult
    if (leftResult.passed !== rightResult.passed || leftResult.message !== rightResult.message) {
      divergences.push({ name: leftResult.name, left: leftResult, right: rightResult })
    }
  }
  return divergences
}
