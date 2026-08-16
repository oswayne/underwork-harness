import { describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ServerResponse } from 'node:http'
import type { SandboxEntity, SandboxFunc, SandboxRequest } from '../src/types.ts'
import type { KvBackend } from '../src/types.ts'
import { SandboxError, SandboxStore, tableName } from '../src/store.ts'
import {
  applyQuery, buildFilter, buildTree, matches, parseFieldValue, pathPrefixRows, sortRows, sumField,
} from '../src/query.ts'
import { SandboxExecutor } from '../src/executor.ts'
import { SandboxRouter } from '../src/router.ts'
import { apply, loadPackage, uploadMock } from '../src/index.ts'
import { MemoryKvBackend } from '../src/memory.ts'

describe('MemoryKvBackend', () => {
  it('loads, upserts, and deletes records across tables', async () => {
    const backend = new MemoryKvBackend()
    expect((await backend.loadAll()).tables).toEqual({})
    await backend.putRecord('a', '1', { v: 1 })
    await backend.putRecord('a', '2', { v: 2 })
    await backend.putRecord('b', '1', { v: 3 })
    expect((await backend.loadAll()).tables.a).toMatchObject({ 1: { v: 1 }, 2: { v: 2 } })
    await backend.deleteRecord('a', '1')
    await backend.deleteRecord('a', 'missing')
    expect(Object.keys((await backend.loadAll()).tables.a!)).toEqual(['2'])
  })
})

function memoryBackend(seed: Record<string, Record<string, unknown>> = {}): KvBackend & { data: Record<string, Record<string, unknown>> } {
  const data = structuredClone(seed)
  return {
    data,
    loadAll: async () => ({ tables: data, global: null }),
    putRecord: async (table, key, value) => {
      data[table] ??= {}
      data[table][key] = value
    },
    deleteRecord: async (table, key) => {
      delete data[table]?.[key]
    },
  }
}

const ORDER_ENTITY: SandboxEntity = {
  name: '订单',
  identifier: 'order',
  fields: [
    { name: 'orderNo', label: '订单号', type: '文本', unique: true },
    { name: 'amount', label: '金额', type: '数字' },
    { name: 'active', label: '启用', type: '布尔' },
    { name: 'date', label: '日期', type: '日期' },
  ],
}

const TREE_ENTITY: SandboxEntity = {
  name: '分类',
  identifier: 'category',
  tree: true,
  fields: [{ name: 'title', label: '标题', type: '文本' }],
}

const SUMMARY_FUNC: SandboxFunc = {
  identifier: 'summary',
  name: '汇总',
  type: 'static',
  body: "const rows = await getColl('order').find({}).toArray()\nreturn { status: 0, data: { count: rows.length }, msg: 'ok' }",
}

const COMPLETE_FUNC: SandboxFunc = {
  identifier: 'complete',
  name: '标记完成',
  type: 'object',
  body: "await getColl('order').updateOne({ _id: entity._id }, { $set: { status: '已完成' } })\nreturn { status: 0, data: entity, msg: 'ok' }",
}

const CONSTRUCTOR_FUNC: SandboxFunc = {
  identifier: 'ensureAmount',
  name: '默认金额',
  type: 'constructor',
  body: "entity.amount = entity.amount ?? 0\nif (entity.orderNo === 'BAD') return { status: 400, data: null, msg: 'bad order' }\nreturn { status: 0, data: entity, msg: 'ok' }",
}

function deps(seed: Record<string, Record<string, unknown>> = {}, extraFuncs: SandboxFunc[] = [], backend?: KvBackend) {
  const entities = new Map<string, SandboxEntity>([
    [ORDER_ENTITY.identifier, ORDER_ENTITY],
    [TREE_ENTITY.identifier, TREE_ENTITY],
  ])
  const funcs = new Map<string, SandboxFunc[]>([
    ['order', [SUMMARY_FUNC, COMPLETE_FUNC, CONSTRUCTOR_FUNC, ...extraFuncs]],
  ])
  const store = new SandboxStore(backend ?? memoryBackend(seed), entities)
  const executor = new SandboxExecutor(store, funcs)
  const router = new SandboxRouter({ store, executor, entities, funcs })
  return { store, executor, router, funcs }
}

function request(method: string, path: string, query: Record<string, string> = {}, body?: unknown): SandboxRequest {
  return { method, path, query, body, session: 's1' }
}

describe('tableName / store', () => {
  it('derives collection names and inserts with defaults, unique checks, and tree data', async () => {
    expect(tableName('order-center')).toBe('order_center')
    const { store } = deps()
    const record = await store.insert('order', { orderNo: 'SO-1', amount: 10 })
    expect(String(record._id)).toBeTruthy()
    expect(record.createTime).toBeTruthy()
    await expect(store.insert('order', { orderNo: 'SO-1' })).rejects.toThrow('已存在')
    const child = await store.insert('category', { title: '根' })
    const branch = await store.insert('category', { title: '子', parent: child._id })
    expect(branch.path).toBe(`${child.path}/${branch._id}`)
    expect(branch.level).toBe(2)
  })

  it('updates, removes, and batch-inserts', async () => {
    const { store } = deps()
    const inserted = await store.insertBatch('order', [{ orderNo: 'A' }, { orderNo: 'B' }])
    const updated = await store.update('order', inserted[0]!._id, { amount: 5 })
    expect(updated.amount).toBe(5)
    expect(updated.modifyTime).toBeTruthy()
    await expect(store.update('order', 'missing', {})).rejects.toBeInstanceOf(SandboxError)
    expect(await store.removeById('order', 'missing')).toBeNull()
    expect(await store.removeMany('order', [inserted[0]!._id, inserted[1]!._id])).toBe(2)
    expect(await store.removeMany('order', ['missing-id'])).toBe(0)
    expect(await store.findById('order', inserted[0]!._id)).toBeNull()
  })

  it('accepts explicit ids, empty tables, and unknown entities', async () => {
    const { store } = deps()
    expect(await store.list('order')).toEqual([])
    const explicit = await store.insert('order', { _id: 'fixed', orderNo: 'X' })
    expect(explicit._id).toBe('fixed')
    const ghost = await store.insert('ghost', { note: 'ok' })
    expect(String(ghost._id)).toBeTruthy()
    expect(ghost.level).toBeUndefined()
  })
})

describe('query engine', () => {
  const rows = [
    { _id: '1', amount: 10, active: true, name: 'Alpha', createdAt: new Date('2026-01-01') },
    { _id: '2', amount: 20, active: false, name: 'beta' },
    { _id: '3', amount: 30, active: true, name: 'Alpha 2' },
  ]
  const fields = new Map(ORDER_ENTITY.fields.map(field => [field.name, field]))

  it('builds filters for like, operators, and unknown-operator fallback', () => {
    expect(buildFilter({ name: 'alpha' }, fields)).toEqual({ name: /alpha/i })
    expect(buildFilter({ amount: 'gt>15' }, fields)).toEqual({ amount: { $gt: 15 } })
    expect(buildFilter({ amount: 'bogus>1' }, fields)).toEqual({ amount: /bogus>1/i })
    expect(buildFilter({ amount: 'in>10,30' }, fields)).toEqual({ amount: { $in: [10, 30] } })
    expect(buildFilter({ 'a[b]': 'x' }, fields)).toEqual({ 'a.b': /x/i })
    expect(buildFilter({ amount: 'gt>', page: '1', _sort: 'x' }, fields)).toEqual({})
  })

  it('matches records against operators', () => {
    expect(matches(rows[0]!, { amount: { $gt: 5 } })).toBe(true)
    expect(matches(rows[0]!, { amount: { $lte: 10 } })).toBe(true)
    expect(matches(rows[1]!, { active: false })).toBe(true)
    expect(matches(rows[0]!, { name: /alpha/i })).toBe(true)
    expect(matches(rows[2]!, { name: { $not: /beta/ } })).toBe(true)
    expect(matches(rows[0]!, { amount: { $in: [10, 99] } })).toBe(true)
    expect(matches(rows[1]!, { amount: { $nin: [10, 30] } })).toBe(true)
    expect(matches(rows[1]!, { missing: null })).toBe(true)
    expect(matches(rows[0]!, { name: { $ne: 'beta' } })).toBe(true)
    expect(matches(rows[0]!, { createdAt: { $gte: new Date('2025-12-01') } })).toBe(true)
  })

  it('sorts, paginates, and guards _preventListAll', () => {
    const outcome = applyQuery(rows, { page: '1', perPage: '2', _sort: 'amount>desc' }, fields)
    expect(outcome.total).toBe(3)
    expect(outcome.items[0]!.amount).toBe(30)
    expect(outcome.items).toHaveLength(2)
    expect(sortRows(rows, '_id>asc')[0]!._id).toBe('1')
    expect(() => applyQuery(rows, { _preventListAll: 'true' }, fields)).toThrow(SandboxError)
  })

  it('assembles trees, branch prefixes, and sums', () => {
    const treeRows = [
      { _id: 'a', path: '/a', level: 1, parent: null },
      { _id: 'b', path: '/a/b', level: 2, parent: 'a' },
      { _id: 'd', path: '/a/d', level: 2, parent: 'a' },
      { _id: 'c', path: '/c', level: 1, parent: null },
      { _id: 'e', path: '/e', level: 1, parent: 5 },
    ]
    const tree = buildTree(treeRows)
    expect(tree).toHaveLength(3)
    expect((tree[0]!.children as unknown[])).toHaveLength(2)
    expect(pathPrefixRows(treeRows, 'a')).toHaveLength(3)
    expect(sumField(rows, 'amount')).toBe(60)
  })

  it('parses field values and covers every operator', () => {
    expect(parseFieldValue('数字', '12')).toBe(12)
    expect(parseFieldValue('布尔', 'true')).toBe(true)
    expect(parseFieldValue('布尔', '1')).toBe(true)
    expect(parseFieldValue('布尔', 'x')).toBe(false)
    expect(parseFieldValue('日期', '2026-01-02')).toBeInstanceOf(Date)
    expect(parseFieldValue('日期', 'not-a-date')).toBe('not-a-date')
    expect(parseFieldValue(undefined, 'plain')).toBe('plain')
    const notLike = buildFilter({ name: 'notLike>alpha' }, fields).name as { $not: RegExp }
    expect(matches(rows[1]!, { name: notLike })).toBe(true)
    expect(matches(rows[0]!, { name: { $not: 'beta' } })).toBe(true)
    expect(matches(rows[0]!, { amount: { $in: [] } })).toBe(false)
    expect(matches(rows[0]!, { amount: { $nin: [] } })).toBe(true)
    expect(matches(rows[1]!, { amount: { $ne: 10 } })).toBe(true)
    expect(matches(rows[0]!, { amount: { $ge: 10 } })).toBe(true)
    expect(matches(rows[0]!, { amount: { $gte: 9 } })).toBe(true)
    expect(matches(rows[0]!, { amount: { $lt: 11 } })).toBe(true)
    expect(matches(rows[0]!, { amount: { $le: 10 } })).toBe(true)
    expect(matches(rows[0]!, { amount: { $lte: 11 } })).toBe(true)
    expect(matches(rows[1]!, { amount: { $gte: 15, $lte: 25 } })).toBe(true)
    expect(matches(rows[0]!, { amount: { $not: { $gte: 15, $lte: 25 } } })).toBe(true)
    expect(matches(rows[0]!, { createdAt: new Date('2026-01-01') })).toBe(true)
    expect(matches(rows[0]!, { amount: 10 })).toBe(true)
    expect(matches(rows[0]!, { 'nested.deep': 1 })).toBe(false)
    expect(matches(rows[0]!, { amount: 999 })).toBe(false)
    expect(buildFilter({ amount: ['gt>1'] }, fields)).toEqual({ amount: { $gt: 1 } })
    expect(buildFilter({ skipped: undefined }, fields)).toEqual({})
    expect(buildFilter({ empty: '' }, fields)).toEqual({})
    expect(matches(rows[0]!, { createdAt: '2026-01-01' })).toBe(false)
    expect(matches(rows[1]!, { createdAt: new Date('2026-01-01') })).toBe(false)
    expect(matches(rows[0]!, { amount: /x/ })).toBe(false)
    expect(matches(rows[0]!, { obj: { a: 1 } })).toBe(false)
  })

  it('hits every operator arm through buildFilter', () => {
    const cases: [string, string, boolean][] = [
      ['isNull', 'x', false],
      ['isNotNull', 'x', true],
      ['isBlank', 'x', false],
      ['isNotBlank', 'x', true],
      ['notIn', '10,30', true],
      ['eq', '20', true],
      ['ne', '20', false],
      ['ge', '10', true],
      ['gte', '11', true],
      ['gt', '5', true],
      ['lt', '20', false],
      ['le', '10', false],
      ['lte', '9', false],
      ['between', '10,20', true],
      ['notBetween', '10,20', false],
      ['gt', '30', false],
    ]
    for (const [operator, value, expected] of cases) {
      const filter = buildFilter({ amount: `${operator}>${value}` }, fields)
      expect(matches(rows[1]!, filter)).toBe(expected)
    }
  })

  it('sorts with explicit rules and applies defaults', () => {
    expect(sortRows(rows, 'amount>asc,active>desc')[0]!._id).toBe('1')
    expect(sortRows(rows, 'amount>asc,')[0]!._id).toBe('1')
    const outcome = applyQuery(rows, { _sort: ['amount>desc'] }, fields)
    expect(outcome.items[0]!._id).toBe('3')
    expect(applyQuery(rows, {}, fields).perPage).toBe(15)
    expect(applyQuery(rows, { page: '0' }, fields).page).toBe(1)
    expect(applyQuery(rows, { page: ['2'], perPage: ['2'] }, fields).page).toBe(2)
    expect(sortRows([{ _id: '1', amount: 5 }, { _id: '2', amount: 5 }], 'amount>asc').map(row => row._id)).toEqual(['1', '2'])
    expect(pathPrefixRows([...rows, { _id: '4', path: 7 }], 'a')).toHaveLength(0)
    expect(sumField(rows, 'missing')).toBe(0)
  })
})

describe('executor', () => {
  it('executes static, object, and missing-function paths', async () => {
    const { store, executor } = deps()
    await store.insert('order', { orderNo: 'SO-1', amount: 7 })
    const summary = await executor.call('order', 'summary')
    expect(summary.data).toEqual({ count: 1 })
    const entity = await store.list('order')
    const complete = await executor.call('order', 'complete', String(entity[0]!._id))
    expect((complete.data as Record<string, unknown>).orderNo).toBe('SO-1')
    expect(await store.findById('order', entity[0]!._id)).toMatchObject({ status: '已完成' })
    expect(await executor.call('order', 'nope')).toMatchObject({ status: 404 })
    expect(await executor.call('order', 'complete')).toMatchObject({ status: 400 })
    expect(await executor.call('order', 'complete', 'missing')).toMatchObject({ status: 404 })
  })

  it('returns default and error envelopes and injects vocabulary', async () => {
    const { store, executor } = deps()
    expect(await executor.execute('const x = 1')).toEqual({ status: 0, data: {}, msg: null })
    expect((await executor.execute('await ('))).toMatchObject({ status: 500 })
    expect((await executor.execute('return { status: 0, data: { id: new ObjectId("ab").toString(), d: new Decimal(1).plus(2).toNumber(), h: crypto.createHash("sha256").update("x").digest("hex").length } }')).data)
      .toMatchObject({ id: 'ab', d: 3, h: 64 })
    const result = await executor.execute("const c = getColl('order')\nawait c.insertOne({ orderNo: 'G1' })\nconst n = await c.countDocuments({})\nawait c.updateOne({ orderNo: 'G1' }, { $set: { amount: 9 } })\nconst one = await c.findOne({ orderNo: 'G1' })\nawait c.deleteOne({ orderNo: 'G1' })\nreturn { status: 0, data: { n, amount: one.amount, left: await c.countDocuments({}) } }")
    expect(result.data).toEqual({ n: 1, amount: 9, left: 0 })
    const recursive = await executor.execute("return { status: 0, data: await __funcExecutor('order', 'summary') }")
    expect((recursive.data as { data: unknown }).data).toEqual({ count: 0 })
    expect(await store.list('order')).toHaveLength(0)
  })

  it('covers vocabulary, error kinds, and collection fallbacks', async () => {
    const { store, executor } = deps()
    await store.insert('order', { orderNo: 'G1', amount: 1 })
    const vocab = await executor.execute(
      "reportError('e'); reportService('s')\nconst oid = new ObjectId('ff').toString()\nconst dec = new Decimal(1).plus(2).toString()\nconst f = dayjs('2026-01-02').format() + dayjs().format()\nconst d = dayjs('2026-01-02').toDate().getTime() > 0\nreturn { status: 0, data: { oid, dec, f, d } }",
    )
    expect(vocab.data).toMatchObject({ oid: 'ff', dec: '3', f: '2026-01-02', d: true })
    expect((await executor.execute('throw "boom"'))).toMatchObject({ status: 500, data: 'boom' })
    expect(await executor.call('ghost', 'x')).toMatchObject({ status: 404 })
    expect(await executor.call('order', 'ensureAmount')).toMatchObject({ status: 400 })
    const coll = await executor.execute(
      "const c = getColl('order')\nconst a = await c.find().toArray()\nconst b = await c.findOne()\nconst n = await c.countDocuments()\nawait c.updateOne({ orderNo: 'G1' }, {})\nconst gone = await c.findOne({ orderNo: 'missing' })\nreturn { status: 0, data: { a: a.length, b: b.orderNo, n, gone: gone === null } }",
    )
    expect(coll.data).toEqual({ a: 1, b: 'G1', n: 1, gone: true })
    const dateVocab = await executor.execute('return { status: 0, data: { d: dayjs().toDate().toString().length } }')
    expect((dateVocab.data as Record<string, unknown>).d).toBeGreaterThan(0)
  })
})

describe('router', () => {
  it('serves CRUD, queries, stats, tree, and func routes', async () => {
    const { router, store } = deps()
    const created = await router.handle(request('POST', '/order', {}, { orderNo: 'SO-1', amount: 10, active: true }))
    expect(created.body.status).toBe(0)
    const id = String((created.body.data as Record<string, unknown>)._id)
    expect((await router.handle(request('GET', `/order/${id}`))).body.data).toMatchObject({ orderNo: 'SO-1' })
    expect((await router.handle(request('GET', '/order/list'))).body.data).toHaveLength(1)
    expect((await router.handle(request('GET', '/order/page', { perPage: '1' }))).body.data).toMatchObject({ total: 1, page: 1 })
    expect((await router.handle(request('GET', '/order', { amount: 'gt>5' }))).body.data).toMatchObject({ orderNo: 'SO-1' })
    expect((await router.handle(request('GET', '/order/stats/count'))).body.data).toBe(1)
    expect((await router.handle(request('GET', '/order/stats/amount/sum'))).body.data).toBe(10)
    expect((await router.handle(request('PATCH', `/order/${id}`, {}, { amount: 11 }))).body.data).toMatchObject({ amount: 11 })
    expect((await router.handle(request('POST', '/order/func/summary'))).body.data).toEqual({ count: 1 })
    expect((await router.handle(request('POST', `/order/${id}/func/complete`))).body.status).toBe(0)
    expect((await store.findById('order', id))).toMatchObject({ status: '已完成' })
    expect((await router.handle(request('DELETE', `/order/${id}`))).body.data).toBeTruthy()
  })

  it('runs constructors, batch, tree, and error paths', async () => {
    const { router } = deps()
    const seeded = await router.handle(request('POST', '/order', {}, { orderNo: 'SO-X', amount: undefined }))
    expect((seeded.body.data as Record<string, unknown>).amount).toBe(0)
    const rejected = await router.handle(request('POST', '/order', {}, { orderNo: 'BAD' }))
    expect(rejected.statusCode).toBe(400)
    expect((await router.handle(request('POST', '/order/batch', {}, [{ orderNo: 'B1' }, { orderNo: 'B2' }]))).body.status).toBe(0)
    const root = await router.handle(request('POST', '/category/tree/branch', {}, { title: '根' }))
    expect((root.body.data as Record<string, unknown>).level).toBe(1)
    const tree = await router.handle(request('GET', '/category/tree'))
    expect((tree.body.data as unknown[])).toHaveLength(1)
    const branch = await router.handle(request('GET', '/category/tree/none/branch'))
    expect(branch.statusCode).toBe(404)
    expect((await router.handle(request('GET', '/order/tree'))).statusCode).toBe(400)
    expect((await router.handle(request('POST', '/order', {}, []))).statusCode).toBe(400)
    expect((await router.handle(request('GET', '/nope/list'))).statusCode).toBe(404)
    expect((await router.handle(request('GET', '/order/nope'))).body.data).toBeNull()
    expect((await router.handle(request('GET', '/order/stats/amount/sum'))).body.data).toBe(0)
  })

  it('covers remaining router branches', async () => {
    const { router } = deps()
    expect((await router.handle(request('GET', ''))).statusCode).toBe(404)
    expect((await router.handle(request('POST', '/order/batch', {}, {}))).statusCode).toBe(400)
    const root = await router.handle(request('POST', '/category/tree/branch', {}, { title: '根' }))
    const rootId = String((root.body.data as Record<string, unknown>)._id)
    const branch = await router.handle(request('GET', `/category/tree/${rootId}/branch`))
    expect(branch.statusCode).toBe(200)
    expect((await router.handle(request('DELETE', `/category/${rootId}/branch`))).body.status).toBe(0)
    const fresh = deps()
    expect((await fresh.router.handle(request('GET', '/order'))).body.data).toBeNull()
    const seeded = await router.handle(request('POST', '/order', {}, { orderNo: 'OK1', amount: 5 }))
    const id = String((seeded.body.data as Record<string, unknown>)._id)
    const deleted = await router.handle(request('DELETE', '/order/data', { amount: 'gt>4' }))
    expect(deleted.body.data).toBe(1)
    expect((await router.handle(request('POST', '/order', {}, { orderNo: 'SYNC' }))).body.status).toBe(0)
    const sync = await router.handle(request('POST', `/order/${id}/func/complete/sync`))
    expect(sync.body.status).toBe(404)
  })

  it('maps non-sandbox errors to 500', async () => {
    const errorBackend: KvBackend = {
      loadAll: async () => ({ tables: {}, global: null }),
      putRecord: async () => { throw new Error('backend exploded') },
      deleteRecord: async () => {},
    }
    const { router: errorRouter } = deps({}, [], errorBackend)
    expect((await errorRouter.handle(request('POST', '/order', {}, { orderNo: 'X' }))).statusCode).toBe(500)

    const stringBackend: KvBackend = {
      loadAll: async () => ({ tables: {}, global: null }),
      putRecord: async () => { throw 'string boom' },
      deleteRecord: async () => {},
    }
    const { router: stringRouter } = deps({}, [], stringBackend)
    const response = await stringRouter.handle(request('POST', '/order', {}, { orderNo: 'Y' }))
    expect(response.statusCode).toBe(500)
    expect(response.body.data).toBe('string boom')
  })

  it('handles constructor 500 and missing-msg results', async () => {
    const failing: SandboxFunc = {
      identifier: 'boom',
      name: '爆炸',
      type: 'constructor',
      body: 'return { status: 500, data: null }',
    }
    const silent: SandboxFunc = {
      identifier: 'silent',
      name: '静默',
      type: 'constructor',
      body: 'return { status: 400, data: null }',
    }
    const { router: first } = deps({}, [failing])
    expect((await first.handle(request('POST', '/order', {}, { orderNo: 'C1' }))).statusCode).toBe(500)
    const { router: second } = deps({}, [silent])
    expect((await second.handle(request('POST', '/order', {}, { orderNo: 'C2' }))).statusCode).toBe(400)
    const noMsgFunc: SandboxFunc = {
      identifier: 'noMsg',
      name: '无消息',
      type: 'static',
      body: 'return { status: 0, data: {} }',
    }
    const { router: third } = deps({}, [noMsgFunc])
    expect((await third.handle(request('POST', '/order/func/noMsg'))).body.msg).toBe('')
    const quietObject: SandboxFunc = {
      identifier: 'quietObject',
      name: '静默对象',
      type: 'object',
      body: 'return { status: 0, data: {} }',
    }
    const { router: fourth, store: fourthStore } = deps({}, [quietObject])
    const target = await fourthStore.insert('order', { orderNo: 'Q1' })
    const quiet = await fourth.handle(request('POST', `/order/${String(target._id)}/func/quietObject`))
    expect(quiet.body.msg).toBe('')
    expect((await fourth.handle(request('POST', '/category', {}, { title: '根' }))).body.status).toBe(0)
  })
})

describe('plugin and adapter', () => {
  it('loads the committed app package', () => {
    const { entities, funcs } = loadPackage('app-packages/cszh/dsh-test')
    expect(entities.get('order')?.fields.map(field => field.name)).toContain('orderNo')
    expect(funcs.get('order')?.map(func => func.identifier)).toEqual(expect.arrayContaining(['summary', 'complete']))
  })

  it('loads packages with sparse meta and empty func directories', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uicp-sandbox-'))
    try {
      mkdirSync(join(dir, 'entities'), { recursive: true })
      mkdirSync(join(dir, 'funcs', 'a'), { recursive: true })
      mkdirSync(join(dir, 'funcs', 'empty'), { recursive: true })
      writeFileSync(join(dir, 'entities', 'a.json'), JSON.stringify({ identifier: 'a', fields: [] }))
      writeFileSync(join(dir, 'funcs', 'a', 'f.js'), 'return { status: 0 }')
      writeFileSync(join(dir, 'funcs', 'a', 'f.meta.json'), JSON.stringify({ identifier: 'f' }))
      writeFileSync(join(dir, 'funcs', 'a', 'g.js'), 'return { status: 0 }')
      writeFileSync(join(dir, 'funcs', 'a', 'g.meta.json'), JSON.stringify({ identifier: 'g', type: 'static' }))
      writeFileSync(join(dir, 'funcs', 'empty', '.keep'), '')
      const { entities, funcs } = loadPackage(dir)
      expect(entities.get('a')).toBeTruthy()
      expect(funcs.get('a')?.map(func => func.type)).toEqual(['static', 'static'])
      expect(funcs.has('empty')).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('registers routes and serves requests end to end', async () => {
    const registered = vi.fn()
    const fakeUnit = memoryBackend()
    const ctx = {
      webServer: { register: (route: unknown) => { registered(route); return () => {} } },
      storage: { backend: { get: () => ({ kv: { open: async () => fakeUnit } }) } },
      effect: (fn: () => unknown) => { fn(); return undefined },
    } as never
    apply(ctx, { packageDir: 'app-packages/cszh/dsh-test', session: 's1', maxBodyBytes: 1024 })
    const routes = registered.mock.calls.map(call => call[0] as {
      path: string
      handler: (req: unknown, res: ServerResponse) => Promise<void>
    })
    expect(routes.map(route => route.path)).toEqual(['/app-package/entity', '/app-package/upload'])
    const dataRoute = routes[0]!.handler
    const uploadCaptured: { statusCode: number; body: string } = { statusCode: 0, body: '' }
    await routes[1]!.handler({}, {
      writeHead: (code: number) => { uploadCaptured.statusCode = code },
      end: (body: string) => { uploadCaptured.body = body },
    } as unknown as ServerResponse)
    expect((JSON.parse(uploadCaptured.body) as { data: { url: string } }).data.url).toBe('mock://upload')
    const response = await runRoute(dataRoute, '/app-package/entity/order/page?perPage=5', 'GET')
    expect((JSON.parse(response) as { data: { total: number; page: number } }).data).toMatchObject({ total: 0, page: 1 })
    const inserted = await runRoute(dataRoute, '/app-package/entity/order', 'POST', JSON.stringify({ orderNo: 'R1', amount: 3 }))
    expect((JSON.parse(inserted) as { status: number }).status).toBe(0)
    const listed = await runRoute(dataRoute, '/app-package/entity/order/list', 'GET')
    expect(((JSON.parse(listed) as { data: unknown[] }).data)).toHaveLength(1)
    const oversize = await runRoute(dataRoute, '/app-package/entity/order', 'POST', JSON.stringify({ big: 'x'.repeat(2048) }))
    expect((JSON.parse(oversize) as { status: number }).status).toBe(413)
  })

  it('serves the upload mock', () => {
    const captured: { statusCode: number; body: string } = { statusCode: 0, body: '' }
    const res = {
      writeHead: (code: number) => { captured.statusCode = code },
      end: (body: string) => { captured.body = body },
    } as unknown as ServerResponse
    uploadMock(res)
    expect(captured.statusCode).toBe(200)
    expect((JSON.parse(captured.body) as { data: { url: string } }).data.url).toBe('mock://upload')
  })

  it('validates config and covers adapter branches', async () => {
    const registered = vi.fn()
    const fakeUnit = memoryBackend()
    const ctx = {
      webServer: { register: (route: unknown) => { registered(route); return () => {} } },
      storage: { backend: { get: () => ({ kv: { open: async () => fakeUnit } }) } },
      effect: (fn: () => unknown) => { fn(); return undefined },
    } as never
    expect(() => { apply(ctx, { packageDir: '' }) }).toThrow('packageDir is required')
    const noKvCtx = {
      webServer: { register: (route: unknown) => { registered(route); return () => {} } },
      storage: { backend: { get: () => ({}) } },
      effect: (fn: () => unknown) => { fn(); return undefined },
    } as never
    expect(() => { apply(noKvCtx, { packageDir: 'x' }) }).toThrow('no KV facet')
    apply(ctx, { packageDir: 'app-packages/cszh/dsh-test', backendName: 'json' })
    const routes = registered.mock.calls.map(call => call[0] as {
      path: string
      handler: (req: unknown, res: ServerResponse) => Promise<void>
    })
    const dataRoute = routes[0]!.handler
    const head = await runRoute(dataRoute, '/app-package/entity/order/page?a=1&a=2', 'HEAD')
    expect((JSON.parse(head) as { status: number }).status).toBe(404)
    const created = await runRoute(dataRoute, '/app-package/entity/order', 'POST', JSON.stringify({ orderNo: 'R2' }))
    const id = String(((JSON.parse(created) as { data: Record<string, unknown> }).data)._id)
    const removed = await runRoute(dataRoute, `/app-package/entity/order/${id}`, 'DELETE')
    expect((JSON.parse(removed) as { status: number }).status).toBe(0)
    const malformed = await runRoute(dataRoute, '/app-package/entity/order', 'POST', '{oops')
    expect((JSON.parse(malformed) as { status: number }).status).toBe(400)
    const noUrlCaptured: { statusCode: number; body: string } = { statusCode: 0, body: '' }
    await dataRoute(Readable.from([]), {
      writeHead: (code: number) => { noUrlCaptured.statusCode = code },
      end: (body: string) => { noUrlCaptured.body = body },
    } as unknown as ServerResponse)
    expect(noUrlCaptured.statusCode).toBe(404)
    const session = await runRoute(dataRoute, '/app-package/entity/order/list?__session=sx', 'GET')
    expect((JSON.parse(session) as { status: number }).status).toBe(0)
    const bytesCaptured: { statusCode: number; body: string } = { statusCode: 0, body: '' }
    await dataRoute(Object.assign(Readable.from([new Uint8Array([1, 2])]), { method: 'POST', url: '/app-package/entity/order' }), {
      writeHead: (code: number) => { bytesCaptured.statusCode = code },
      end: (body: string) => { bytesCaptured.body = body },
    } as unknown as ServerResponse)
    expect((JSON.parse(bytesCaptured.body) as { status: number }).status).toBe(400)
  })
})

async function runRoute(
  handler: (req: unknown, res: ServerResponse) => Promise<void>,
  url: string,
  method: string,
  body?: string,
): Promise<string> {
  const captured: { statusCode: number; body: string } = { statusCode: 0, body: '' }
  const res = {
    writeHead: (statusCode: number) => { captured.statusCode = statusCode },
    end: (chunk: string) => { captured.body = chunk },
  } as unknown as ServerResponse
  const req = Object.assign(
    body === undefined ? Readable.from([]) : Readable.from([body]),
    { method, url },
  )
  await handler(req, res)
  return captured.body
}
