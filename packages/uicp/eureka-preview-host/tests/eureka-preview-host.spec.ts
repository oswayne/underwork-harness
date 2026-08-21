// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { EurekaPreviewEnv } from '../src/index.ts'
import { createEditorHandle } from '../src/editor-state.ts'
import { savePageSchema } from '../src/save.ts'
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
    expect(registered).toEqual(['@deepseek-ai/dsh-eureka-preview-host'])
    expect(invariantInject).toEqual(['invariants'])
    expect(invariantName).toBeTruthy()
    disposer()
  })
})
import type { PackageFs } from '../src/save.ts'

// monaco consults editor-command probes and global listeners at module init;
// jsdom provides neither in the shape eureka expects.
Object.defineProperty(globalThis, 'addEventListener', { value: () => {}, configurable: true, writable: true })
Object.defineProperty(globalThis, 'removeEventListener', { value: () => {}, configurable: true, writable: true })
Object.defineProperty(globalThis, 'dispatchEvent', { value: () => true, configurable: true, writable: true })
Object.defineProperty(document, 'queryCommandSupported', { value: () => false, configurable: true })
Object.defineProperty(document, 'queryCommandState', { value: () => false, configurable: true })
Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true })

function fixtureEnv(): EurekaPreviewEnv {
  return {
    fetcher: async () => ({ status: 0, data: { items: [], total: 0, page: 1 } }),
  }
}

describe('mountEurekaPreview', () => {
  it('renders the committed order-list page with default env options', async () => {
    const { mountEurekaPreview } = await import('../src/index.ts')
    document.body.innerHTML = '<div id="root"></div>'
    const schema = JSON.parse(readFileSync('app-packages/cszh/dsh-test/pages/order-list.json', 'utf8')) as unknown
    const handle = mountEurekaPreview(document.getElementById('root')!, schema, fixtureEnv())
    await new Promise(resolve => setTimeout(resolve, 2000))
    const text = document.getElementById('root')!.textContent ?? ''
    expect(text).toContain('订单管理')
    expect(['订单号', '金额', '状态'].every(column => text.includes(column))).toBe(true)
    handle.unmount()
  }, 30000)

  it('renders the committed sre-w demo list page headlessly', async () => {
    const { mountEurekaPreview } = await import('../src/index.ts')
    document.body.innerHTML = '<div id="root"></div>'
    const schema = JSON.parse(readFileSync('app-packages/cszh/sre-w/pages/preserve-list.json', 'utf8')) as unknown
    const handle = mountEurekaPreview(document.getElementById('root')!, schema, fixtureEnv())
    await new Promise(resolve => setTimeout(resolve, 2000))
    const text = document.getElementById('root')!.textContent ?? ''
    expect(text).toContain('保养单')
    expect(text).toContain('保养计划编码')
    handle.unmount()
  }, 30000)

  it('honours explicit theme/locale and optional callbacks', async () => {
    const { mountEurekaPreview } = await import('../src/index.ts')
    document.body.innerHTML = '<div id="root"></div>'
    const schema = { type: 'page', title: '简单页面', body: '内容' }
    const copied: string[] = []
    const handle = mountEurekaPreview(document.getElementById('root')!, schema, {
      fetcher: async () => ({ status: 0, data: {} }),
      isCancel: () => true,
      copy: content => copied.push(content),
      theme: 'antd',
      locale: 'en-US',
    })
    await new Promise(resolve => setTimeout(resolve, 500))
    expect(document.getElementById('root')!.textContent).toContain('简单页面')
    handle.unmount()
    expect(copied).toEqual([])
  })

  it('returns a handle whose unmount clears the container', async () => {
    const { mountEurekaPreview } = await import('../src/index.ts')
    document.body.innerHTML = '<div id="root"></div>'
    const handle = mountEurekaPreview(document.getElementById('root')!, { type: 'page', body: '内容' }, fixtureEnv())
    handle.unmount()
    expect(document.getElementById('root')!.innerHTML).toBe('')
  })
})

describe('createEditorHandle', () => {
  it('tracks edits and saves the current value', () => {
    const saved: unknown[] = []
    const handle = createEditorHandle({ type: 'page' }, (value) => { saved.push(value) })
    expect(handle.getValue()).toEqual({ type: 'page' })
    handle.setValue({ type: 'page', title: '改过' })
    handle.save()
    handle.save()
    expect(saved).toEqual([{ type: 'page', title: '改过' }, { type: 'page', title: '改过' }])
  })
})

describe('savePageSchema', () => {
  it('writes two-space JSON with a trailing newline and returns the path', async () => {
    const written: { target: { displayPath: string }; content: string }[] = []
    const fs = {
      resolve: async (path: string) => ({ displayPath: path }),
      writeText: async (target: { displayPath: string }, content: string) => { written.push({ target, content }) },
    } satisfies PackageFs
    const path = await savePageSchema(fs, '/pkg', 'order-list', { type: 'page', title: '订单' })
    expect(path).toBe('/pkg/pages/order-list.json')
    expect(written[0]!.content).toBe('{\n  "type": "page",\n  "title": "订单"\n}\n')
  })
})
