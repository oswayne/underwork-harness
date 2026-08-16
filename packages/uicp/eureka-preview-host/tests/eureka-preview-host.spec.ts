// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { EurekaPreviewEnv } from '../src/index.ts'

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
