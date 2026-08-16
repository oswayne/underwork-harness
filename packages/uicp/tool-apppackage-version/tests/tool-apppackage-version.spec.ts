import { describe, expect, it, vi } from 'vitest'
import type { FileSystem, FsDirEntry, FsInfo, FsTarget } from '@deepseek-ai/dsh-fs'
import {
  apply, collectProductFiles, listVersions, renderResult, restoreVersion, snapshotVersion,
} from '../src/index.ts'
import { apply as applyInvariant, inject as invariantInject, name as invariantName } from '../src/invariant.ts'

describe('invariant companion', () => {
  it('registers with the invariant service', async () => {
    const registered: string[] = []
    const ctx = {
      invariants: {
        register: (pkg: string, installer: (ctx: unknown, fail: (message: string) => never) => void) => {
          registered.push(pkg)
          installer(null, (message) => { throw new Error(message) })
          return () => {}
        },
      },
    } as never
    const disposer = await applyInvariant(ctx)
    expect(registered).toEqual(['@deepseek-ai/dsh-tool-apppackage-version'])
    expect(invariantInject).toEqual(['invariants'])
    expect(invariantName).toBeTruthy()
    disposer()
  })
})

interface Node {
  type: 'file' | 'directory' | 'other'
  content?: string
  children?: Map<string, Node>
}

function tree(files: Record<string, string>, prefix = 'pkg'): Node {
  const root: Node = { type: 'directory', children: new Map() }
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

function makeFs(root: Node): FileSystem & { snap: () => Record<string, string> } {
  const targetOf = (path: string): FsTarget => ({ targetKey: path as FsTarget['targetKey'], displayPath: path })
  const lookup = (target: FsTarget): Node | undefined => {
    let node: Node | undefined = root
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
  const writeText = async (target: FsTarget, content: string): Promise<void> => {
    const parts = target.displayPath.split('/').filter(Boolean)
    let node: Node = root
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]!
      const isLast = index === parts.length - 1
      if (!node.children!.has(part)) {
        node.children!.set(part, isLast ? { type: 'file', content } : { type: 'directory', children: new Map() })
      }
      node = node.children!.get(part)!
    }
    node.content = content
  }
  const stat = async (target: FsTarget): Promise<FsInfo | undefined> => {
    const node = lookup(target)
    if (node === undefined) return undefined
    const info: FsInfo = { version: 'v' as FsInfo['version'], type: node.type }
    if (node.content !== undefined) info.size = node.content.length
    return info
  }
  const snap = (): Record<string, string> => {
    const out: Record<string, string> = {}
    const walk = (node: Node, prefix: string): void => {
      const children = node.children ?? new Map<string, Node>()
      for (const [name, child] of children) {
        const path = prefix === '' ? name : `${prefix}/${name}`
        if (child.type === 'file') out[path] = child.content!
        else walk(child, path)
      }
    }
    walk(root, '')
    return out
  }
  return { resolve: targetOf, listDir, readText, writeText, stat, snap } as unknown as FileSystem & { snap: () => Record<string, string> }
}

const PACKAGE_FILES = {
  'app.json': '{"name":"dsh"}',
  'menus.json': '[]',
  'entities/order.json': '{"identifier":"order"}',
  'funcs/order/summary.js': 'return 1',
  'funcs/order/summary.meta.json': '{"identifier":"summary"}',
  'pages/order-list.json': '{"type":"page"}',
  'data/order.json': '[]',
  'data/s1/order.json': 'runtime',
  'tests/keep.json': 'nope',
}

describe('collectProductFiles', () => {
  it('collects product files and excludes tests, versions, and session data', async () => {
    const fs = makeFs(tree(PACKAGE_FILES))
    const withOther = tree(PACKAGE_FILES)
    withOther.children!.get('pkg')!.children!.set('weird', { type: 'other' })
    const fsOther = makeFs(withOther)
    const filesOther = await collectProductFiles(fsOther, await fsOther.resolve('/pkg'))
    expect(filesOther.has('weird')).toBe(false)
    const files = await collectProductFiles(fs, await fs.resolve('/pkg'))
    expect(files.get('app.json')).toBe('{"name":"dsh"}')
    expect(files.get('funcs/order/summary.js')).toBe('return 1')
    expect(files.get('data/order.json')).toBe('[]')
    expect(files.has('data/s1/order.json')).toBe(false)
    expect(files.has('tests/keep.json')).toBe(false)
  })
})

describe('snapshot/restore/list', () => {
  it('snapshots, lists, and restores versions', async () => {
    const fs = makeFs(tree(PACKAGE_FILES))
    const version = await snapshotVersion(fs, '/pkg', 'v1')
    expect(version).toBe('v1')
    expect(fs.snap()['pkg/versions/v1/entities/order.json']).toBe('{"identifier":"order"}')
    expect(fs.snap()['pkg/versions/v1/data/s1/order.json']).toBeUndefined()
    expect(await listVersions(fs, '/pkg')).toEqual(['v1'])
    await fs.writeText(await fs.resolve('/pkg/app.json'), '{"name":"changed"}')
    const restored = await restoreVersion(fs, '/pkg', 'v1')
    expect(restored).toBeGreaterThan(0)
    expect(fs.snap()['pkg/app.json']).toBe('{"name":"dsh"}')
  })

  it('defaults snapshot names and returns an empty version list', async () => {
    const fs = makeFs(tree({ 'app.json': '{}' }))
    const version = await snapshotVersion(fs, '/pkg')
    expect(version.length).toBeGreaterThan(0)
    const empty = makeFs(tree({ 'app.json': '{}' }))
    expect(await listVersions(empty, '/pkg')).toEqual([])
  })
})

describe('index', () => {
  it('renders action results', () => {
    const text = renderResult({ ok: true, action: 'snapshot', version: 'v1' })[0]!.text
    expect(text).toContain('snapshot')
    const listed = renderResult({ ok: true, action: 'list', versions: ['v2', 'v1'] })[0]!.text
    expect(listed).toContain('v2')
    const restored = renderResult({ ok: true, action: 'restore', version: 'v1', restored: 3 })[0]!.text
    expect(restored).toContain('restored files: 3')
  })

  it('registers apppackage_version and executes all actions', async () => {
    const registered = vi.fn()
    const fs = makeFs(tree(PACKAGE_FILES))
    const ctx = { fs, tools: { register: (definition: unknown) => { registered(definition); return definition } } } as never
    apply(ctx)
    const definition = registered.mock.calls[0]![0] as {
      execute: (args: { directory: string; action: string; version?: string }) => Promise<{
        ok: boolean
        action: string
        version?: string
        versions?: string[]
        restored?: number
      }>
      output: { render: (args: unknown, value: unknown) => unknown }
    }
    const snapshot = await definition.execute({ directory: '/pkg', action: 'snapshot', version: 'v9' })
    expect(snapshot.version).toBe('v9')
    const list = await definition.execute({ directory: '/pkg', action: 'list' })
    expect(list.versions).toContain('v9')
    const restore = await definition.execute({ directory: '/pkg', action: 'restore', version: 'v9' })
    expect(restore.restored).toBeGreaterThan(0)
    await expect(definition.execute({ directory: '/pkg', action: 'restore' })).rejects.toThrow('requires version')
    definition.output.render({ directory: '/pkg' }, { ok: true, action: 'list', versions: [] })
  })
})
