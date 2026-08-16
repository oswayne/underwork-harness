import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SandboxEntity, SandboxFunc } from '@deepseek-ai/dsh-sandbox-server/src/types.ts'
import { MemoryKvBackend, SandboxExecutor, SandboxRouter, SandboxStore } from '@deepseek-ai/dsh-sandbox-server'
import { generateCases, type TestCase } from '../src/cases.ts'
import { runSuite, type CaseResult } from '../src/runner.ts'
import { apply, loadFixtures, renderResult } from '../src/index.ts'

const ORDER: SandboxEntity = {
  name: '订单',
  identifier: 'order',
  fields: [
    { name: 'orderNo', label: '订单号', type: '文本', unique: true },
    { name: 'amount', label: '金额', type: '数字' },
  ],
}

const TREE: SandboxEntity = { name: '分类', identifier: 'category', tree: true, fields: [{ name: 'title', label: '标题', type: '文本' }] }

function funcs(overrides: Partial<Record<string, SandboxFunc[]>> = {}): Map<string, SandboxFunc[]> {
  const map = new Map<string, SandboxFunc[]>([
    ['order', [
      { identifier: 'summary', name: '汇总', type: 'static', body: 'return { status: 0, data: {} }' },
      { identifier: 'complete', name: '完成', type: 'object', body: 'return { status: 0, data: entity }' },
      { identifier: 'ensure', name: '默认值', type: 'constructor', body: 'return { status: 0, data: entity }' },
      { identifier: 'external', name: '外部', type: 'static', body: 'const r = await axios.get("/x")\nreturn r' },
    ]],
  ])
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) map.delete(key)
    else map.set(key, value)
  }
  return map
}

describe('generateCases', () => {
  it('covers CRUD, unique, query, tree, and func branches', () => {
    const entities = new Map<string, SandboxEntity>([[ORDER.identifier, ORDER], [TREE.identifier, TREE]])
    const fixtures = new Map<string, Record<string, unknown>[]>([
      ['order', [{ orderNo: 'SO-1', amount: 10 }]],
      ['category', []],
    ])
    const cases = generateCases(entities, funcs(), fixtures)
    const names = cases.map(test => test.name)
    expect(names).toContain('order: insert')
    expect(names).toContain('order: duplicate unique orderNo')
    expect(names).toContain('order: gt amount')
    expect(names).toContain('order: func summary')
    expect(names).toContain('order: func complete missing record')
    expect(names).toContain('order: constructor ensure')
    expect(names).toContain('order: func external external')
    expect(names).toContain('category: tree')
    expect(cases.find(test => test.name === 'order: func external external')?.skip).toBeTruthy()
  })

  it('skips optional branches for sparse entities and empty funcs', () => {
    const sparse: SandboxEntity = { name: '稀疏', identifier: 'sparse', fields: [{ name: 'name', label: '名称', type: '文本' }] }
    const cases = generateCases(new Map([[sparse.identifier, sparse]]), new Map(), new Map())
    expect(cases.map(test => test.name)).toEqual([
      'sparse: insert',
      'sparse: list',
      'sparse: page',
      'sparse: preventListAll',
    ])
  })
})

describe('runSuite', () => {
  async function routerWith(fixtures: Record<string, Record<string, unknown>[]> = {}) {
    const entities = new Map<string, SandboxEntity>([[ORDER.identifier, ORDER]])
    const store = new SandboxStore(new MemoryKvBackend(), entities)
    for (const [identifier, records] of Object.entries(fixtures)) {
      for (const record of records) await store.insert(identifier, record)
    }
    const executor = new SandboxExecutor(store, funcs())
    return new SandboxRouter({ store, executor, entities, funcs: funcs() })
  }

  it('marks skipped and failing cases with structured messages', async () => {
    const router = await routerWith()
    const cases: TestCase[] = [
      { name: 'skip', method: 'GET', path: '/order/list', expect: {}, skip: '外部依赖' },
      { name: 'ok', method: 'GET', path: '/order/list', expect: { statusCode: 200, status: 0, data: {} } },
      { name: 'code', method: 'GET', path: '/order/nope', expect: { statusCode: 201 } },
      { name: 'status', method: 'GET', path: '/order/list', expect: { status: 1 } },
      { name: 'data', method: 'GET', path: '/order/list', expect: { data: { page: 1 } } },
      { name: 'dataobj', method: 'GET', path: '/order/nope', expect: { data: {} } },
    ]
    const results = await runSuite(router, cases)
    expect(results[0]).toMatchObject({ passed: true, skipped: '外部依赖' })
    expect(results[1]!.passed).toBe(true)
    expect(results[2]!.passed).toBe(false)
    expect(results[2]!.message).toContain('statusCode')
    expect(results[3]!.message).toContain('status')
    expect(results[4]!.message).toContain('data.page')
    expect(results[5]!.message).toContain('data 不是对象')
  })

  it('returns an empty report for no cases', async () => {
    const router = await routerWith()
    expect(await runSuite(router, [])).toEqual([])
  })
})

describe('index', () => {
  it('loads fixtures and rejects a missing data directory', () => {
    const fixtures = loadFixtures('app-packages/cszh/dsh-test')
    expect(fixtures.get('order')).toHaveLength(3)
    const dir = mkdtempSync(join(tmpdir(), 'uicp-test-'))
    try {
      expect(() => loadFixtures(dir)).toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('renders pass/fail/skip lines', () => {
    const result = {
      ok: false,
      cases: 2,
      passed: 1,
      failed: 1,
      results: [
        { name: 'a', passed: true, message: 'ok' },
        { name: 'b', passed: false, message: 'bad' },
        { name: 'c', passed: true, skipped: '外部', message: 'skipped' },
      ] as CaseResult[],
    }
    const text = renderResult(result)[0]!.text
    expect(text).toContain('FAIL (1/2)')
    expect(text).toContain('[SKIP] c')
  })

  it('registers apppackage_test and runs the committed package', async () => {
    const registered = vi.fn()
    const written: { target: string; content: string }[] = []
    const ctx = {
      fs: {
        resolve: async (path: string) => ({ targetKey: path, displayPath: path }),
        writeText: async (target: { displayPath: string }, content: string) => { written.push({ target: target.displayPath, content }) },
      },
      tools: { register: (definition: unknown) => { registered(definition); return definition } },
    } as never
    apply(ctx)
    const definition = registered.mock.calls[0]![0] as {
      execute: (args: { directory: string }) => Promise<{ ok: boolean; cases: number; passed: number; failed: number; results: unknown[] }>
      output: { render: (args: unknown, value: unknown) => unknown }
    }
    expect(registered).toHaveBeenCalledTimes(1)
    const result = await definition.execute({ directory: 'app-packages/cszh/dsh-test' })
    expect(result.ok).toBe(true)
    expect(result.cases).toBeGreaterThan(0)
    expect(result.passed).toBe(result.cases)
    expect(written[0]!.target).toContain('tests/apppackage.cases.json')
    expect(JSON.parse(written[0]!.content) as unknown[]).toHaveLength(result.cases)
    definition.output.render({ directory: '/x' }, result)
  })

  it('seeds fixture data before running object functions', async () => {
    const registered = vi.fn()
    const ctx = {
      fs: { resolve: async (path: string) => ({ targetKey: path, displayPath: path }), writeText: async () => {} },
      tools: { register: (definition: unknown) => { registered(definition); return definition } },
    } as never
    apply(ctx)
    const definition = registered.mock.calls[0]![0] as { execute: (args: { directory: string }) => Promise<{ ok: boolean }> }
    const result = await definition.execute({ directory: 'app-packages/cszh/dsh-test' })
    expect(result.ok).toBe(true)
  })
})
