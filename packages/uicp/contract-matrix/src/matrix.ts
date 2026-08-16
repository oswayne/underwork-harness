/** Fixed behavior-matrix corpus shared by the sandbox and platform targets. */

/** One matrix case against the canonical `matrix` entity. */
export interface MatrixCase {
  name: string
  method: string
  path: string
  query?: Record<string, string>
  body?: Record<string, unknown>
  /** Expected `body.status` (the platform/eureka success code); defaults to 0. */
  status?: number
  /** Partial expected `data` value (deep-ish match); null expects null. */
  data?: Record<string, unknown> | null
}

/** The fixed corpus: every query operator, CRUD, stats, tree, constructor, and func semantics. */
export function buildMatrix(): MatrixCase[] {
  const cases: MatrixCase[] = []
  const add = (
    name: string,
    method: string,
    path: string,
    query?: Record<string, string>,
    body?: Record<string, unknown>,
    data?: Record<string, unknown> | null,
    status?: number,
  ): void => {
    const entry: MatrixCase = { name, method, path }
    if (query !== undefined) entry.query = query
    if (body !== undefined) entry.body = body
    if (status !== undefined) entry.status = status
    if (data !== undefined) entry.data = data
    cases.push(entry)
  }

  // Read-only queries against the seeded state (Alpha 10 / Beta 20 / Gamma 30)
  add('find-by-id', 'GET', '/matrix/seed-1', undefined, undefined, { name: 'Alpha' })
  add('missing-record', 'GET', '/matrix/000000000000000000000000', undefined, undefined, null)

  // Query operators
  add('like', 'GET', '/matrix/list', { name: 'alpha' }, undefined, { length: 1 })
  add('notLike', 'GET', '/matrix/list', { name: 'notLike>alpha' }, undefined, { length: 2 })
  add('isNull', 'GET', '/matrix/list', { amount: 'isNull>x' }, undefined, { length: 0 })
  add('isNotNull', 'GET', '/matrix/list', { amount: 'isNotNull>x' }, undefined, { length: 3 })
  add('isBlank', 'GET', '/matrix/list', { amount: 'isBlank>x' }, undefined, { length: 0 })
  add('isNotBlank', 'GET', '/matrix/list', { amount: 'isNotBlank>x' }, undefined, { length: 3 })
  add('in', 'GET', '/matrix/list', { amount: 'in>10,30' }, undefined, { length: 2 })
  add('notIn', 'GET', '/matrix/list', { amount: 'notIn>10,30' }, undefined, { length: 1 })
  add('eq', 'GET', '/matrix/list', { amount: 'eq>20' }, undefined, { length: 1 })
  add('ne', 'GET', '/matrix/list', { amount: 'ne>20' }, undefined, { length: 2 })
  add('gt', 'GET', '/matrix/list', { amount: 'gt>25' }, undefined, { length: 1 })
  add('ge', 'GET', '/matrix/list', { amount: 'ge>20' }, undefined, { length: 2 })
  add('gte', 'GET', '/matrix/list', { amount: 'gte>19' }, undefined, { length: 2 })
  add('lt', 'GET', '/matrix/list', { amount: 'lt>20' }, undefined, { length: 1 })
  add('le', 'GET', '/matrix/list', { amount: 'le>20' }, undefined, { length: 2 })
  add('lte', 'GET', '/matrix/list', { amount: 'lte>19' }, undefined, { length: 1 })
  add('between', 'GET', '/matrix/list', { amount: 'between>10,20' }, undefined, { length: 2 })
  add('notBetween', 'GET', '/matrix/list', { amount: 'notBetween>10,20' }, undefined, { length: 1 })
  add('unknown-operator-fallback', 'GET', '/matrix/list', { amount: 'bogus>10' }, undefined, { length: 0 })
  add('empty-operator-skipped', 'GET', '/matrix/list', { amount: 'gt>' }, undefined, { length: 3 })
  add('empty-value-skipped', 'GET', '/matrix/list', { name: '' }, undefined, { length: 3 })
  add('boolean-eq', 'GET', '/matrix/list', { active: 'eq>true' }, undefined, { length: 2 })
  add('date-gt', 'GET', '/matrix/list', { date: 'gt>2026-01-01' }, undefined, { length: 2 })
  add('prevent-list-all', 'GET', '/matrix/list', { _preventListAll: 'true' }, undefined, undefined, 400)

  // Sort and pagination
  add('sort-amount-desc', 'GET', '/matrix/list', { _sort: 'amount>desc' }, undefined, { firstAmount: 30 })
  add('sort-name-asc', 'GET', '/matrix/list', { _sort: 'name>asc' }, undefined, { firstName: 'Alpha' })
  add('page-bounds', 'GET', '/matrix/page', { page: '2', perPage: '2' }, undefined, { page: 2 })
  add('page-out-of-range', 'GET', '/matrix/page', { page: '99', perPage: '2' }, undefined, { page: 99 })

  // Stats
  add('stats-count', 'GET', '/matrix/stats/count', undefined, undefined, { value: 3 })
  add('stats-sum', 'GET', '/matrix/stats/amount/sum', undefined, undefined, { value: 60 })

  // Functions
  add('static-func', 'POST', '/matrix/func/staticOk')
  add('object-func-missing', 'POST', '/matrix/000000000000000000000000/func/objectOk', undefined, undefined, undefined, 404)
  add('object-func-ok', 'POST', '/matrix/seed-1/func/objectOk', undefined, undefined, { name: 'Alpha' })

  // Tree entity (independent of the matrix entity)
  add('tree-query', 'GET', '/matrix-tree/tree', undefined, undefined, { length: 1 })
  add('tree-branch', 'GET', '/matrix-tree/tree/tree-1/branch', undefined, undefined, { length: 1 })
  add('tree-branch-empty', 'GET', '/matrix-tree/tree/000000000000000000000000/branch', undefined, undefined, undefined, 404)

  // Mutations last so earlier read-only expectations stay seed-based
  add('insert-new', 'POST', '/matrix', undefined, { name: 'Delta', amount: 40, active: false, date: '2026-04-01' })
  add('insert-defaults', 'POST', '/matrix', undefined, { name: 'NoAmount' })
  add('insert-constructor-fail', 'POST', '/matrix', undefined, { name: 'BAD' }, undefined, 400)
  add('duplicate-unique', 'POST', '/matrix', undefined, { name: 'Alpha' }, undefined, 400)
  add('update', 'PATCH', '/matrix/seed-1', undefined, { amount: 11 })
  add('delete', 'DELETE', '/matrix/seed-1')
  add('delete-missing', 'DELETE', '/matrix/000000000000000000000000')

  return cases
}
