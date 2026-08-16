import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { apply, collectFiles, renderResult } from '../src/index.ts'
import { validatePackage } from '../src/validate.ts'
import type { FileSystem, FsDirEntry, FsTarget } from '@deepseek-ai/dsh-fs'

const SCHEMA_TEXT = readFileSync(new URL('../data/eureka-schema.json', import.meta.url), 'utf8')

interface FakeNode {
  type: 'file' | 'directory'
  content?: string
  children?: Map<string, FakeNode>
}

const PREFIX = 'work/app-packages/cszh/dsh-test'

function fakeTree(files: Record<string, string>, prefix = PREFIX): FakeNode {
  const root: FakeNode = { type: 'directory', children: new Map() }
  for (const [path, content] of Object.entries(files)) {
    const parts = `${prefix}/${path}`.split('/')
    let node = root
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]!
      const isLast = index === parts.length - 1
      if (!node.children!.has(part)) {
        node.children!.set(part, isLast ? { type: 'file', content } : { type: 'directory', children: new Map() })
      }
      node = node.children!.get(part)!
    }
  }
  return root
}

function makeFs(root: FakeNode): FileSystem {
  const targetOf = (path: string): FsTarget => ({ targetKey: path as FsTarget['targetKey'], displayPath: path })
  const lookup = (target: FsTarget): FakeNode | undefined => {
    let node: FakeNode | undefined = root
    for (const part of target.displayPath.split('/').filter(Boolean)) {
      node = node?.type === 'directory' ? node.children!.get(part) : undefined
    }
    return node
  }
  const listDir = async (target: FsTarget): Promise<FsDirEntry[]> => {
    const node = lookup(target)
    if (node === undefined || node.type !== 'directory') throw new Error(`ENOENT: ${target.displayPath}`)
    return [...node.children!.entries()].map(([name, child]) => ({
      name,
      type: child.type,
      target: targetOf(`${target.displayPath}/${name}`),
    }))
  }
  const readText = async (target: FsTarget): Promise<string> => {
    const node = lookup(target)
    if (node === undefined || node.type !== 'file') throw new Error(`ENOENT: ${target.displayPath}`)
    return node.content!
  }
  return { resolve: targetOf, listDir, readText } as unknown as FileSystem
}

function validFiles(): Record<string, string> {
  return {
    'app.json': JSON.stringify({ name: 'dsh', identifier: 'dsh-test' }),
    'tenant.json': JSON.stringify({ identifier: 'cszh', name: '测试租户', available: true }),
    'entities/order.json': JSON.stringify({
      name: '订单', identifier: 'order', fields: [
        { name: 'orderNo', label: '订单号', type: '文本', unique: true, editable: false },
        { name: 'amount', label: '金额', type: '数字', unique: false, editable: true },
        { name: 'active', label: '启用', type: '布尔', unique: false, editable: true },
      ],
    }),
    'funcs/order/summary.js': "const orders = await getColl('order').find({}).toArray()\nreturn { status: 0, data: orders }",
    'funcs/order/summary.meta.json': JSON.stringify({ identifier: 'summary', name: '汇总', type: 'static', comment: '' }),
    'pages/order-list.json': JSON.stringify({ type: 'page', title: '订单管理', body: [], regions: ['body'] }),
    'menus.json': JSON.stringify([{ name: '订单列表', group: '订单中心', path: '/orders', page: 'order-list' }]),
    'data/order.json': JSON.stringify([{ orderNo: 'SO-001', amount: 12.5, active: true }]),
  }
}

function run(files: Record<string, string>, ctx = { tenantDirName: 'cszh', appDirName: 'dsh-test' }) {
  return validatePackage(files, ctx, SCHEMA_TEXT)
}

function rulesOf(result: ReturnType<typeof validatePackage>): string[] {
  return result.issues.map(item => item.rule)
}

describe('validatePackage', () => {
  it('accepts a valid package with no issues or dependencies', () => {
    const result = run(validFiles())
    expect(result.issues).toEqual([])
    expect(result.dependencies).toEqual([])
  })

  it('accepts the committed example package', () => {
    const root = new URL('../../../../app-packages/cszh/dsh-test', import.meta.url).pathname
    const files: Record<string, string> = {}
    for (const rel of ['app.json', 'tenant.json', 'menus.json', 'entities/order.json', 'funcs/order/summary.js', 'funcs/order/summary.meta.json', 'funcs/order/complete.js', 'funcs/order/complete.meta.json', 'pages/order-list.json', 'data/order.json']) {
      files[rel] = readFileSync(`${root}/${rel}`, 'utf8')
    }
    const result = validatePackage(files, { tenantDirName: 'cszh', appDirName: 'dsh-test' }, SCHEMA_TEXT)
    expect(result.issues.filter(item => item.severity === 'error')).toEqual([])
    expect(result.dependencies).toEqual([])
  })

  it('reports missing and invalid app/tenant records', () => {
    const files = validFiles()
    delete files['app.json']
    delete files['tenant.json']
    const missing = run(files)
    expect(rulesOf(missing)).toContain('package.missing')

    const invalid = run({ ...validFiles(), 'app.json': '{', 'tenant.json': '[]' })
    expect(rulesOf(invalid)).toContain('json.invalid')

    const mismatch = run(validFiles(), { tenantDirName: 'other', appDirName: 'other' })
    expect(rulesOf(mismatch)).toEqual(expect.arrayContaining(['package.identifier', 'package.tenant']))

    const noName = run({ ...validFiles(), 'app.json': JSON.stringify({ identifier: 'dsh-test' }) })
    expect(rulesOf(noName)).toContain('package.name')
  })

  it('validates entity identifiers, fields, and duplicates', () => {
    const badId = run({ ...validFiles(), 'entities/Bad-Id.json': JSON.stringify({ identifier: 'bad-id', fields: [] }) })
    expect(rulesOf(badId)).toContain('entity.identifier')

    const noId = run({ ...validFiles(), 'entities/no-id.json': JSON.stringify({ fields: [] }) })
    expect(rulesOf(noId)).toContain('entity.identifier')

    const mismatch = run({ ...validFiles(), 'entities/order.json': JSON.stringify({ identifier: 'wrong', fields: [] }) })
    expect(rulesOf(mismatch)).toContain('entity.identifier')

    const dup = run({
      ...validFiles(),
      'entities/a.json': JSON.stringify({ identifier: 'a', fields: [] }),
      'entities/b.json': JSON.stringify({ identifier: 'a', fields: [] }),
    })
    expect(rulesOf(dup)).toContain('entity.duplicate')

    const badEntity = run({ ...validFiles(), 'entities/order.json': '{' })
    expect(rulesOf(badEntity)).toContain('json.invalid')

    const noFields = run({ ...validFiles(), 'entities/order.json': JSON.stringify({ identifier: 'order' }) })
    expect(rulesOf(noFields)).toContain('entity.fields')

    const badFields = run({
      ...validFiles(),
      'entities/order.json': JSON.stringify({
        identifier: 'order',
        fields: [
          null,
          { name: '', label: 'x', type: '文本' },
          { name: 'a', label: '', type: '未知', unique: 'yes', editable: 1 },
          { name: 'a', label: 'A', type: '文本' },
          { name: 'x2', label: 'X2', type: 42 },
        ],
      }),
    })
    const fieldRules = rulesOf(badFields)
    expect(fieldRules).toContain('entity.field')
    expect(fieldRules.filter(rule => rule === 'entity.field').length).toBeGreaterThanOrEqual(6)
  })

  it('validates funcs: meta pairing, types, syntax, external vocabulary', () => {
    const files = validFiles()
    delete files['funcs/order/summary.meta.json']
    const missingMeta = run(files)
    expect(rulesOf(missingMeta)).toContain('func.meta')

    const badMeta = run({ ...validFiles(), 'funcs/order/summary.meta.json': '[' })
    expect(rulesOf(badMeta)).toContain('json.invalid')

    const mismatch = run({ ...validFiles(), 'funcs/order/summary.meta.json': JSON.stringify({ identifier: 'other', type: 'static' }) })
    expect(rulesOf(mismatch)).toContain('func.identifier')

    const badType = run({ ...validFiles(), 'funcs/order/summary.meta.json': JSON.stringify({ identifier: 'summary', type: 'magic' }) })
    expect(rulesOf(badType)).toContain('func.type')

    const syntax = run({ ...validFiles(), 'funcs/order/summary.js': 'await (' })
    expect(rulesOf(syntax)).toContain('func.syntax')

    const external = run({ ...validFiles(), 'funcs/order/summary.js': 'const r = await axios.get("/x")\nreturn r' })
    const externalRules = rulesOf(external)
    expect(externalRules).toContain('func.external')
    expect(externalRules.filter(rule => rule === 'func.external')).toHaveLength(1)
  })

  it('validates pages: parse, type, and Eureka schema', () => {
    const unparsable = run({ ...validFiles(), 'pages/order-list.json': '{' })
    expect(rulesOf(unparsable)).toContain('json.invalid')

    const wrongType = run({ ...validFiles(), 'pages/order-list.json': JSON.stringify({ type: 'form', body: [] }) })
    expect(rulesOf(wrongType)).toContain('page.type')

    const badSchema = run({ ...validFiles(), 'pages/order-list.json': JSON.stringify({ type: 'page', title: 123 }) })
    expect(rulesOf(badSchema)).toContain('page.schema')
  })

  it('validates menus: structure, name, and page mounts', () => {
    const files = validFiles()
    delete files['menus.json']
    expect(rulesOf(run(files))).toContain('package.missing')

    const notArray = run({ ...validFiles(), 'menus.json': '{}' })
    expect(rulesOf(notArray)).toContain('menu.structure')

    const unparsable = run({ ...validFiles(), 'menus.json': '{' })
    expect(rulesOf(unparsable)).toContain('menu.structure')

    const badMenus = run({
      ...validFiles(),
      'menus.json': JSON.stringify([null, { name: '', page: 42 }, { name: 'x', page: 'missing-page' }, { name: 'no-mount' }]),
    })
    const menuRules = rulesOf(badMenus)
    expect(menuRules).toContain('menu.structure')
    expect(menuRules).toContain('menu.name')
    expect(menuRules).toContain('menu.page')
    expect(menuRules).toContain('menu.mount')
  })

  it('validates fixture data against entity fields and types', () => {
    const noEntity = run({ ...validFiles(), 'data/ghost.json': '[]' })
    expect(rulesOf(noEntity)).toContain('data.entity')

    const badJson = run({ ...validFiles(), 'data/order.json': '{' })
    expect(rulesOf(badJson)).toContain('json.invalid')

    const notArray = run({ ...validFiles(), 'data/order.json': '{}' })
    expect(rulesOf(notArray)).toContain('data.structure')

    const badRecords = run({
      ...validFiles(),
      'entities/order.json': JSON.stringify({
        identifier: 'order',
        fields: [
          { name: 'orderNo', label: '订单号', type: '文本' },
          { name: 'ref', label: '引用', type: 'ObjectId' },
          { name: 'date', label: '日期', type: '日期' },
          { name: 'datetime', label: '日期时间', type: '日期时间' },
          { name: 'amount', label: '金额', type: '数字' },
          { name: 'active', label: '启用', type: '布尔' },
          { name: 'extra', label: '对象', type: '对象' },
        ],
      }),
      'data/order.json': JSON.stringify([
        null,
        { orderNo: 1, ref: 1, date: 1, datetime: 1, amount: '12.5', active: 'yes', extra: 1, unknown: 1 },
      ]),
    })
    const dataRules = rulesOf(badRecords)
    expect(dataRules).toContain('data.record')
    expect(dataRules).toContain('data.field')
    expect(dataRules).toContain('data.type')
  })

  it('extracts cross-app dependencies and skips own identifiers', () => {
    const files: Record<string, string> = {
      ...validFiles(),
      'pages/order-list.json': JSON.stringify({ type: 'page', title: '/app-package/entity/customer/page' }),
      'funcs/order/summary.js': "const a = getColl('customer').find({}).toArray()\nconst b = await __funcExecutor('wms', 'refresh', null)\nconst c = getColl('product').find({}).toArray()",
    }
    const result = run(files)
    expect(result.dependencies).toEqual([
      { identifier: 'customer', kind: 'data', references: ['funcs/order/summary.js', 'pages/order-list.json'] },
      { identifier: 'product', kind: 'data', references: ['funcs/order/summary.js'] },
      { identifier: 'wms', kind: 'func', references: ['funcs/order/summary.js'] },
    ])
  })

  it('warns when the package has no entities, funcs, or pages', () => {
    const empty = run({
      'app.json': JSON.stringify({ name: 'dsh', identifier: 'dsh-test' }),
      'tenant.json': JSON.stringify({ identifier: 'cszh' }),
      'menus.json': '[]',
    })
    const warnings = empty.issues.filter(item => item.severity === 'warning').map(item => item.rule)
    expect(warnings).toEqual(expect.arrayContaining(['package.empty']))
  })

  it('caches the compiled Eureka validator across calls', () => {
    run(validFiles())
    const result = run(validFiles())
    expect(result.issues).toEqual([])
  })
})

describe('collectFiles', () => {
  it('collects contract files and skips unrelated entries', async () => {
    const fs = makeFs(fakeTree({
      ...validFiles(),
      'app.json': '{}',
      'pages/notes.txt': 'skip me',
      'funcs/README.md': 'skip me',
      'funcs/order/subdir/x.js': 'skip me',
      'data/order.json': '[]',
    }))
    const files = await collectFiles(fs, await fs.resolve(`/${PREFIX}`))
    expect(files['app.json']).toBe('{}')
    expect(files['entities/order.json']).toBeTruthy()
    expect(files['funcs/order/summary.js']).toBeTruthy()
    expect(files['funcs/order/summary.meta.json']).toBeTruthy()
    expect(files['pages/order-list.json']).toBeTruthy()
    expect(files['pages/notes.txt']).toBeUndefined()
    expect(files['funcs/README.md']).toBeUndefined()
    expect(files['data/order.json']).toBe('[]')
  })

  it('skips non-file and absent entries', async () => {
    const fs = makeFs(fakeTree({
      'app.json': '{}',
      'entities/deep/order.json': '{}',
      'data/order.json': '[]',
    }))
    const root = await fs.resolve(`/${PREFIX}`)
    const files = await collectFiles(fs, root)
    expect(files['tenant.json']).toBeUndefined()
    expect(files['menus.json']).toBeUndefined()
    expect(files['entities/deep/order.json']).toBeUndefined()
    expect(files['funcs/order/summary.js']).toBeUndefined()
  })

  it('rejects when the root directory is missing', async () => {
    const fs = makeFs(fakeTree({}))
    await expect(collectFiles(fs, await fs.resolve('/missing'))).rejects.toThrow('ENOENT')
  })
})

describe('renderResult', () => {
  it('renders ok, issues, and dependencies', () => {
    const ok = renderResult({ ok: true, issues: [], dependencies: [] })
    expect(ok[0]!.text).toContain('OK')
    const withIssues = renderResult({
      ok: false,
      issues: [{ severity: 'error', file: 'app.json', rule: 'package.name', message: '缺少 name' }],
      dependencies: [{ identifier: 'customer', kind: 'data', references: ['pages/x.json'] }],
    })
    expect(withIssues[0]!.text).toContain('FAIL')
    expect(withIssues[0]!.text).toContain('app.json')
    expect(withIssues[0]!.text).toContain('customer')
  })
})

describe('apply', () => {
  it('registers apppackage_validate and executes through ctx.fs', async () => {
    const registered = vi.fn()
    const ctx = {
      fs: makeFs(fakeTree(validFiles())),
      tools: { register: (definition: unknown) => { registered(definition); return definition } },
    } as never
    apply(ctx)
    const definition = registered.mock.calls[0]![0] as {
      execute: (args: { directory: string }) => Promise<unknown>
      output: { render: (args: unknown, value: unknown) => unknown }
    }
    expect(registered).toHaveBeenCalledTimes(1)
    const result = await definition.execute({ directory: `/${PREFIX}` }) as { ok: boolean; issues: unknown[] }
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
    const trailing = await definition.execute({ directory: `/${PREFIX}/` }) as { ok: boolean }
    expect(trailing.ok).toBe(true)
    definition.output.render({ directory: '/x' }, result)
  })

  it('reports ok=false for error issues and ok=true for warning-only issues', async () => {
    const brokenRegistered = vi.fn()
    const broken = makeFs(fakeTree({ 'tenant.json': '{}' }))
    const brokenCtx = {
      fs: broken,
      tools: { register: (definition: unknown) => { brokenRegistered(definition); return definition } },
    } as never
    apply(brokenCtx)
    const brokenDefinition = brokenRegistered.mock.calls[0]![0] as { execute: (args: { directory: string }) => Promise<{ ok: boolean }> }
    const brokenResult = await brokenDefinition.execute({ directory: `/${PREFIX}` })
    expect(brokenResult.ok).toBe(false)

    const warnedRegistered = vi.fn()
    const warned = makeFs(fakeTree({ ...validFiles(), 'funcs/order/summary.js': 'const r = await axios.get("/x")\nreturn r' }))
    const warnedCtx = {
      fs: warned,
      tools: { register: (definition: unknown) => { warnedRegistered(definition); return definition } },
    } as never
    apply(warnedCtx)
    const warnedDefinition = warnedRegistered.mock.calls[0]![0] as { execute: (args: { directory: string }) => Promise<{ ok: boolean }> }
    const warnedResult = await warnedDefinition.execute({ directory: `/${PREFIX}` })
    expect(warnedResult.ok).toBe(true)
  })

  it('propagates a missing-directory failure', async () => {
    const registered = vi.fn()
    const ctx = {
      fs: makeFs(fakeTree({})),
      tools: { register: (definition: unknown) => { registered(definition); return definition } },
    } as never
    apply(ctx)
    const definition = registered.mock.calls[0]![0] as { execute: (args: { directory: string }) => Promise<unknown> }
    await expect(definition.execute({ directory: '/missing' })).rejects.toThrow('ENOENT')
  })
})
