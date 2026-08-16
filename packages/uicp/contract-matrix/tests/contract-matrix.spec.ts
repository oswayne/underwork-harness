import { describe, expect, it } from 'vitest'
import { buildMatrix } from '../src/matrix.ts'
import { diffMatrix, runMatrix, type MatrixResponse } from '../src/runner.ts'
import { buildReferenceTarget } from '../src/reference.ts'

describe('buildMatrix', () => {
  it('yields a unique-named corpus covering every contract facet', () => {
    const cases = buildMatrix()
    expect(cases.length).toBeGreaterThan(40)
    expect(new Set(cases.map(test => test.name)).size).toBe(cases.length)
    const names = cases.map(test => test.name).join(' ')
    for (const operator of ['like', 'notLike', 'isNull', 'isNotNull', 'isBlank', 'isNotBlank', 'in', 'notIn', 'eq', 'ne', 'gt', 'ge', 'gte', 'lt', 'le', 'lte', 'between', 'notBetween']) {
      expect(names).toContain(operator)
    }
    expect(names).toContain('prevent-list-all')
    expect(names).toContain('tree-branch')
    expect(names).toContain('insert-constructor-fail')
  })
})

describe('runMatrix against the reference sandbox', () => {
  it('passes every case on a freshly seeded sandbox', async () => {
    const reference = buildReferenceTarget()
    await reference.seed()
    const results = await runMatrix(reference.target, buildMatrix(), reference.resolve)
    const failed = results.filter(result => !result.passed)
    expect(failed.map(result => `${result.name}: ${result.message}`)).toEqual([])
    expect(results.every(result => result.passed)).toBe(true)
  })

  it('reports case failures with messages', async () => {
    const reference = buildReferenceTarget()
    await reference.seed()
    const broken: (
      request: { method: string; path: string; query: Record<string, string>; body?: Record<string, unknown> },
    ) => Promise<MatrixResponse> =
      async () => ({ statusCode: 500, body: { status: 500, msg: 'boom', data: {} } })
    const results = await runMatrix(broken, buildMatrix(), reference.resolve)
    expect(results.every(result => result.passed)).toBe(false)
    expect(results[0]!.message).toContain('statusCode')
  })
})

describe('diffMatrix', () => {
  it('finds no divergences between identical targets and flags differing ones', async () => {
    const left = buildReferenceTarget()
    await left.seed()
    const right = buildReferenceTarget()
    await right.seed()
    const divergences = await diffMatrix(left.target, right.target, buildMatrix())
    expect(divergences).toEqual([])

    const divergent: (
      request: { method: string; path: string; query: Record<string, string>; body?: Record<string, unknown> },
    ) => Promise<MatrixResponse> =
      async () => ({ statusCode: 404, body: { status: 404, msg: 'missing', data: {} } })
    const left2 = buildReferenceTarget()
    await left2.seed()
    const flagged = await diffMatrix(left2.target, divergent, buildMatrix(), left2.resolve)
    expect(flagged.length).toBeGreaterThan(0)
    expect(flagged[0]!.left.passed).toBe(true)
    expect(flagged[0]!.right.passed).toBe(false)
  })
})

describe('runMatrix expectation matching', () => {
  it('matches nested, scalar, array, and null expectations with failures', async () => {
    const objectTarget = async (): Promise<MatrixResponse> =>
      ({ statusCode: 200, body: { status: 0, msg: '', data: { deep: { a: 1 }, n: 5 } } })
    const arrayTarget = async (): Promise<MatrixResponse> =>
      ({ statusCode: 200, body: { status: 0, msg: '', data: [{ amount: 5, name: 'X' }] } })
    const scalarTarget = async (): Promise<MatrixResponse> =>
      ({ statusCode: 200, body: { status: 0, msg: '', data: 5 } })

    const ok = await runMatrix(objectTarget, [
      { name: 'deep-ok', method: 'GET', path: '/x', data: { deep: { a: 1 } } },
    ])
    const scalarOk = await runMatrix(scalarTarget, [
      { name: 'scalar-ok', method: 'GET', path: '/x', data: { value: 5 } },
    ])
    expect(ok.every(result => result.passed)).toBe(true)
    expect(scalarOk.every(result => result.passed)).toBe(true)

    const fails = await runMatrix(objectTarget, [
      { name: 'deep-fail', method: 'GET', path: '/x', data: { deep: { a: 2 } } },
      { name: 'null-wrong', method: 'GET', path: '/x', data: null },
    ])
    const scalarFail = await runMatrix(scalarTarget, [
      { name: 'scalar-fail', method: 'GET', path: '/x', data: { value: 6 } },
    ])
    expect(fails.map(result => result.passed)).toEqual([false, false])
    expect(fails[1]!.message).toContain('null')
    expect(scalarFail[0]!.passed).toBe(false)

    const arrayFails = await runMatrix(arrayTarget, [
      { name: 'len-fail', method: 'GET', path: '/x', data: { length: 9 } },
      { name: 'amount-fail', method: 'GET', path: '/x', data: { firstAmount: 99 } },
      { name: 'name-fail', method: 'GET', path: '/x', data: { firstName: 'Y' } },
    ])
    expect(arrayFails.every(result => !result.passed)).toBe(true)
  })
})
