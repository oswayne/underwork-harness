/** Deterministic test-case generation from entities, functions, and fixtures. */

import type { SandboxEntity, SandboxFunc } from '@deepseek-ai/dsh-sandbox-server/src/types.ts'

/** One generated test case against the sandbox REST surface. */
export interface TestCase {
  name: string
  method: string
  path: string
  query?: Record<string, string>
  body?: Record<string, unknown>
  expect: {
    statusCode?: number
    status?: number
    data?: Record<string, unknown>
  }
  skip?: string
}

const EXTERNAL_VOCAB_RE = /\b(axios|ai|requireAdapter)\b/

/**
 * Generate positive, negative, and boundary cases from the package contract.
 * @param entities - entity definitions by identifier.
 * @param funcs - function definitions by entity identifier.
 * @param fixtures - seeded records by entity identifier (first record is the CRUD sample).
 * @returns ordered test cases.
 */
export function generateCases(
  entities: ReadonlyMap<string, SandboxEntity>,
  funcs: ReadonlyMap<string, SandboxFunc[]>,
  fixtures: ReadonlyMap<string, Record<string, unknown>[]>,
): TestCase[] {
  const cases: TestCase[] = []
  for (const entity of entities.values()) {
    const identifier = entity.identifier
    const sample = fixtures.get(identifier)?.[0] ?? {}
    const uniqueField = entity.fields.find(field => field.unique)
    const insertBody = uniqueField !== undefined && sample[uniqueField.name] !== undefined
      ? { ...sample, [uniqueField.name]: `${String(sample[uniqueField.name])}-new` }
      : sample
    cases.push({
      name: `${identifier}: insert`,
      method: 'POST',
      path: `/${identifier}`,
      body: insertBody,
      expect: { status: 0 },
    })
    if (uniqueField !== undefined && sample[uniqueField.name] !== undefined) {
      cases.push({
        name: `${identifier}: duplicate unique ${uniqueField.name}`,
        method: 'POST',
        path: `/${identifier}`,
        body: sample,
        expect: { status: 400 },
      })
    }
    cases.push({ name: `${identifier}: list`, method: 'GET', path: `/${identifier}/list`, expect: { status: 0 } })
    cases.push({
      name: `${identifier}: page`,
      method: 'GET',
      path: `/${identifier}/page`,
      query: { page: '1', perPage: '5' },
      expect: { status: 0, data: { page: 1 } },
    })
    cases.push({
      name: `${identifier}: preventListAll`,
      method: 'GET',
      path: `/${identifier}/list`,
      query: { _preventListAll: 'true' },
      expect: { status: 400 },
    })
    const numberField = entity.fields.find(field => field.type === '数字')
    if (numberField !== undefined && sample[numberField.name] !== undefined) {
      cases.push({
        name: `${identifier}: gt ${numberField.name}`,
        method: 'GET',
        path: `/${identifier}/list`,
        query: { [numberField.name]: `gt>${String(sample[numberField.name])}` },
        expect: { status: 0 },
      })
    }
    if (entity.tree) {
      cases.push({ name: `${identifier}: tree`, method: 'GET', path: `/${identifier}/tree`, expect: { status: 0 } })
    }
    for (const func of funcs.get(identifier) ?? []) {
      if (EXTERNAL_VOCAB_RE.test(func.body)) {
        cases.push({
          name: `${identifier}: func ${func.identifier} external`,
          method: 'POST',
          path: `/${identifier}/func/${func.identifier}`,
          expect: {},
          skip: '外部依赖词汇，依赖人工处理',
        })
        continue
      }
      if (func.type === 'static') {
        cases.push({
          name: `${identifier}: func ${func.identifier}`,
          method: 'POST',
          path: `/${identifier}/func/${func.identifier}`,
          expect: { status: 0 },
        })
      }
      if (func.type === 'object') {
        cases.push({
          name: `${identifier}: func ${func.identifier} missing record`,
          method: 'POST',
          path: `/${identifier}/not-a-record/func/${func.identifier}`,
          expect: { status: 404 },
        })
      }
      if (func.type === 'constructor') {
        cases.push({
          name: `${identifier}: constructor ${func.identifier}`,
          method: 'POST',
          path: `/${identifier}`,
          body: insertBody,
          expect: { status: 0 },
        })
      }
    }
  }
  return cases
}
