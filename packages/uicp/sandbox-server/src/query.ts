/** Query assembly and evaluation mirroring uicp `DataQueryApp` / `Field`. */

import type { SandboxField } from './types.ts'
import { SandboxError } from './store.ts'

export const QUERY_OPERATORS = new Set([
  'like', 'notLike', 'isNull', 'isNotNull', 'isBlank', 'isNotBlank', 'in', 'notIn',
  'eq', 'ne', 'gt', 'ge', 'gte', 'lt', 'le', 'lte', 'between', 'notBetween',
])

const RESERVED_PARAMS = new Set(['page', 'perPage', '_sort', '_preventListAll'])

/** `field[sub]` → `field.sub`. */
export function normalizeKey(key: string): string {
  return key.replace(/\[([^\]]+)\]/g, '.$1')
}

/** Escape a literal for RegExp construction (like the platform `like`). */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Convert one query value by field type. */
export function parseFieldValue(type: string | undefined, value: string): unknown {
  if (type === '数字') return Number(value)
  if (type === '布尔') return value === 'true' || value === '1'
  if (type === '日期' || type === '日期时间') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date
  }
  return value
}

function multiValue(type: string | undefined, value: string): unknown[] {
  return value.split(',').map(part => parseFieldValue(type, part.trim())).filter(part => part !== '')
}

function condition(field: SandboxField | undefined, operator: string, value: string): unknown {
  const type = field?.type
  switch (operator) {
    case 'like': return new RegExp(escapeRegExp(value), 'i')
    case 'notLike': return { $not: new RegExp(escapeRegExp(value), 'i') }
    case 'isNull': return null
    case 'isNotNull': return { $ne: null }
    case 'isBlank': return { $in: [null, ''] }
    case 'isNotBlank': return { $nin: [null, ''] }
    case 'in': return { $in: multiValue(type, value) }
    case 'notIn': return { $nin: multiValue(type, value) }
    case 'eq': return parseFieldValue(type, value)
    case 'ne': return { $ne: parseFieldValue(type, value) }
    case 'gt': return { $gt: parseFieldValue(type, value) }
    case 'ge':
    case 'gte': return { $gte: parseFieldValue(type, value) }
    case 'lt': return { $lt: parseFieldValue(type, value) }
    case 'le':
    case 'lte': return { $lte: parseFieldValue(type, value) }
    case 'between': {
      const [low, high] = multiValue(type, value)
      return { $gte: low, $lte: high }
    }
    case 'notBetween': {
      const [low, high] = multiValue(type, value)
      return { $not: { $gte: low, $lte: high } }
    }
  }
}

/** Build the Mongo-shaped filter from query params. */
export function buildFilter(
  params: Record<string, string | string[] | undefined>,
  fields: ReadonlyMap<string, SandboxField>,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(params)) {
    if (RESERVED_PARAMS.has(key) || raw === undefined) continue
    const value = Array.isArray(raw) ? raw[0] : raw
    if (value === undefined || value === '') continue
    const name = normalizeKey(key)
    const field = fields.get(name)
    // Mirror uicp DataQueryApp: unknown fields are skipped, never like-filtered.
    if (field === undefined) continue
    const separator = value.indexOf('>')
    if (separator === -1) {
      filter[name] = condition(field, 'like', value)
    } else {
      const operator = value.slice(0, separator)
      const operand = value.slice(separator + 1)
      if (operand === '') continue
      filter[name] = QUERY_OPERATORS.has(operator) ? condition(field, operator, operand) : condition(field, 'like', value)
    }
  }
  return filter
}

function valueAtPath(record: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>(
    (acc, part) => (acc === null || acc === undefined ? undefined : (acc as Record<string, unknown>)[part]),
    record,
  )
}

function equal(actual: unknown, expected: unknown): boolean {
  if (expected === null) return actual === null || actual === undefined
  if (actual instanceof Date && expected instanceof Date) return actual.getTime() === expected.getTime()
  return stringify(actual) === stringify(expected)
}

function stringify(value: unknown): string {
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
}

function compare(actual: unknown, expected: unknown): number {
  if (actual instanceof Date && expected instanceof Date) return actual.getTime() - expected.getTime()
  if (typeof actual === 'number' && typeof expected === 'number') return actual - expected
  return String(actual).localeCompare(String(expected))
}

/** Evaluate one operator object against a single actual value. */
function matchesOperators(actual: unknown, op: Record<string, unknown>): boolean {
  if ('$not' in op) {
    const inner = op.$not
    if (inner instanceof RegExp) return !(typeof actual === 'string' && inner.test(actual))
    if (typeof inner === 'object') return !matchesOperators(actual, inner as Record<string, unknown>)
    return !equal(actual, inner)
  }
  if ('$in' in op) return (op.$in as unknown[]).some(item => equal(actual, item))
  if ('$nin' in op) return !(op.$nin as unknown[]).some(item => equal(actual, item))
  if ('$ne' in op) return !equal(actual, op.$ne)
  if ('$gt' in op && compare(actual, op.$gt) <= 0) return false
  if ('$gte' in op && compare(actual, op.$gte) < 0) return false
  if ('$lt' in op && compare(actual, op.$lt) >= 0) return false
  if ('$lte' in op && compare(actual, op.$lte) > 0) return false
  return true
}

/** Whether one record satisfies the filter. */
export function matches(record: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    const actual = valueAtPath(record, key)
    if (expected === null) {
      if (actual !== null && actual !== undefined) return false
      continue
    }
    if (expected instanceof RegExp) {
      if (typeof actual !== 'string' || !expected.test(actual)) return false
      continue
    }
    if (typeof expected === 'object' && !(expected instanceof Date)
      && Object.keys(expected).some(key => key.startsWith('$'))) {
      if (!matchesOperators(actual, expected as Record<string, unknown>)) return false
      continue
    }
    if (!equal(actual, expected)) return false
  }
  return true
}

/** Sort rows by `_sort=field>asc,...` (default `_id` desc). */
export function sortRows(rows: Record<string, unknown>[], sortParam?: string): Record<string, unknown>[] {
  const rules: { field: string; direction: number }[] = []
  if (sortParam === undefined || sortParam === '') {
    rules.push({ field: '_id', direction: -1 })
  } else {
    for (const part of sortParam.split(',')) {
      if (part === '') continue
      const [field, direction = 'asc'] = part.split('>') as [string, string | undefined]
      rules.push({ field, direction: direction === 'asc' ? 1 : -1 })
    }
  }
  return [...rows].sort((left, right) => {
    for (const rule of rules) {
      const compared = compare(valueAtPath(left, rule.field), valueAtPath(right, rule.field))
      if (compared !== 0) return compared * rule.direction
    }
    return 0
  })
}

export interface QueryOutcome {
  items: Record<string, unknown>[]
  total: number
  page: number
  perPage: number
}

/** Filter, sort, and paginate (mirrors `DataRepository.findByPage` semantics). */
export function applyQuery(
  records: Record<string, unknown>[],
  params: Record<string, string | string[] | undefined>,
  fields: ReadonlyMap<string, SandboxField>,
): QueryOutcome {
  const filter = buildFilter(params, fields)
  if (params._preventListAll === 'true' && Object.keys(filter).length === 0) {
    throw new SandboxError(400, '_preventListAll 拒绝空过滤全量查询')
  }
  const filtered = records.filter(record => matches(record, filter))
  const sortParam = Array.isArray(params._sort) ? params._sort[0] : params._sort
  const sorted = sortRows(filtered, sortParam)
  const page = Math.max(1, Number(Array.isArray(params.page) ? params.page[0] : params.page) || 1)
  const perPage = Math.max(1, Number(Array.isArray(params.perPage) ? params.perPage[0] : params.perPage) || 15)
  return {
    items: sorted.slice((page - 1) * perPage, page * perPage),
    total: sorted.length,
    page,
    perPage,
  }
}

/** Assemble parent/child tree from flat rows. */
export function buildTree(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const nodeMap = new Map(rows.map(row => [String(row._id), row]))
  const tree: Record<string, unknown>[] = []
  for (const row of rows) {
    const parentValue = row.parent
    const parent = parentValue === null || parentValue === undefined || typeof parentValue !== 'string'
      ? undefined
      : nodeMap.get(parentValue)
    if (parent !== undefined) {
      const children = parent.children as unknown[] | undefined
      if (children === undefined) parent.children = []
      ;(parent.children as unknown[]).push(row)
    } else {
      tree.push(row)
    }
  }
  return tree
}

/** Rows whose tree path descends from `id` (mirrors the branch regex). */
export function pathPrefixRows(rows: Record<string, unknown>[], id: unknown): Record<string, unknown>[] {
  const prefix = `/${String(id).toLowerCase()}`
  return rows.filter(row => typeof row.path === 'string' && row.path.toLowerCase().startsWith(prefix))
}

/** Sum a numeric field across rows. */
export function sumField(rows: Record<string, unknown>[], field: string): number {
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0)
}
