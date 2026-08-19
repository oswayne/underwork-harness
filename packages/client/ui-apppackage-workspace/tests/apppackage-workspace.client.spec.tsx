// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { zh } from '../src/locales.ts'
import { AppPackageWorkspace } from '../src/client/AppPackageWorkspace.tsx'
import type { AppPackageWorkspaceInjected } from '../src/client/AppPackageWorkspace.tsx'
import { PreviewPanel } from '../src/client/PreviewPanel.tsx'
import { EditorPanel } from '../src/client/EditorPanel.tsx'
import { JsonPanel } from '../src/client/JsonPanel.tsx'
import { TestsPanel } from '../src/client/TestsPanel.tsx'
import { VersionsPanel } from '../src/client/VersionsPanel.tsx'

const t = ((key: string) => zh[key as keyof typeof zh] ?? key) as never

function props(cwd: string | undefined, closeDetails = vi.fn()) {
  const sessionState = (cwd === undefined
    ? { ids: [], byId: {}, current: undefined }
    : {
      ids: ['s1'],
      byId: { s1: { id: 's1', cwd, blank: false } },
      current: 's1',
    }) as never
  const useSessions = ((sel: (s: unknown) => unknown) => {
    return sel(sessionState)
  }) as never
  return {
    t, useSessions, closeDetails,
  } as unknown as PropsRuntime<'details'> & PropsLocale<'apppackage'> & AppPackageWorkspaceInjected
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (window as { UicpEurekaPreview?: unknown }).UicpEurekaPreview
  window.localStorage.clear()
  document.head.querySelectorAll('script[data-uicp-preview], link[data-uicp-preview]').forEach((el) => {
    el.remove()
  })
})

describe('AppPackageWorkspace', () => {
  it('renders the tab bar and loads the preview for the current session cwd', async () => {
    type PreviewMount = (container: Element, schema: unknown, env: unknown) => { unmount: () => void }
    const mount = vi.fn<PreviewMount>(() => ({ unmount: vi.fn() }))
    ;(window as { UicpEurekaPreview?: unknown }).UicpEurekaPreview = { mountEurekaPreview: mount }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 0,
      data: { schema: { type: 'page' }, fixtures: { order: [] }, pages: [{ id: 'order-list', title: '订单管理' }] },
    })))
    vi.stubGlobal('fetch', fetchMock)
    render(<AppPackageWorkspace {...props('/root/cszh/dsh-test')} />)
    expect(screen.getByRole('tab', { name: '预览' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '编辑' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('tab', { name: 'JSON' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('tab', { name: '测试' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('tab', { name: '版本' }).hasAttribute('disabled')).toBe(false)
    await waitFor(() => {
      expect(mount).toHaveBeenCalled()
    })
    const call = mount.mock.calls[0]
    expect(call).toBeDefined()
    expect(call?.[0]).toBeInstanceOf(HTMLElement)
    expect(call?.[1]).toEqual({ type: 'page' })
    expect(typeof (call?.[2] as { fetcher?: unknown } | undefined)?.fetcher).toBe('function')
    expect(fetchMock).toHaveBeenCalledWith('/uicp/preview/page?cwd=' + encodeURIComponent('/root/cszh/dsh-test'))
  })

  it('shows the no-session hint without a current cwd', () => {
    render(<AppPackageWorkspace {...props(undefined)} />)
    expect(screen.getByText('选择一个会话以预览应用包页面')).toBeTruthy()
  })

  it('closes the details column from the workspace header', () => {
    const closeDetails = vi.fn()
    render(<AppPackageWorkspace {...props(undefined, closeDetails)} />)
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(closeDetails).toHaveBeenCalledOnce()
  })

  it('lets the user switch pages when the package has several', async () => {
    type PreviewMount = (container: Element, schema: unknown, env: unknown) => { unmount: () => void }
    const mount = vi.fn<PreviewMount>(() => ({ unmount: vi.fn() }))
    ;(window as { UicpEurekaPreview?: unknown }).UicpEurekaPreview = { mountEurekaPreview: mount }
    const fetchMock = vi.fn(async (url: string) => {
      const page = new URL(url, 'http://localhost').searchParams.get('page')
      return new Response(JSON.stringify({
        status: 0,
        data: {
          schema: { type: 'page', title: page === 'order-detail' ? '订单详情' : '订单管理' },
          fixtures: { order: [] },
          pages: [
            { id: 'order-list', title: '订单管理' },
            { id: 'order-detail', title: '订单详情' },
          ],
        },
      }))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<PreviewPanel cwd="/root/cszh/dsh-test" t={t} />)
    const select = await screen.findByRole('combobox', { name: '页面' })
    expect(select).toBeTruthy()
    fireEvent.change(select, { target: { value: 'order-detail' } })
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('page=order-detail'))
    })
    await waitFor(() => {
      const call = mount.mock.calls.at(-1)
      expect((call?.[1] as { title?: string } | undefined)?.title).toBe('订单详情')
    })
  })

  it('opens the editor in a separate window from the editor tab', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<AppPackageWorkspace {...props('/root/cszh/dsh-test')} />)
    fireEvent.click(screen.getByRole('tab', { name: '编辑' }))
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining(`/uicp/editor?cwd=${encodeURIComponent('/root/cszh/dsh-test')}`),
      'uicp-editor',
      expect.stringContaining('width=1280'),
    )
    expect(screen.getByText('编辑器已在独立窗口打开，页面切换与保存请在该窗口操作')).toBeTruthy()
  })

  it('reopens the editor window from the editor seat', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<EditorPanel cwd="/root/cszh/dsh-test" t={t} />)
    fireEvent.click(screen.getByRole('button', { name: '打开编辑器窗口' }))
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining(`/uicp/editor?cwd=${encodeURIComponent('/root/cszh/dsh-test')}`),
      'uicp-editor',
      expect.stringContaining('width=1280'),
    )
  })

  it('shows the failure when the editor popup is blocked', async () => {
    vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<EditorPanel cwd="/root/cszh/dsh-test" t={t} />)
    fireEvent.click(screen.getByRole('button', { name: '打开编辑器窗口' }))
    await waitFor(() => {
      expect(screen.getByText('打开编辑器窗口失败：popup blocked')).toBeTruthy()
    })
  })

  it('renders the page as JSON and saves parsed edits with validation feedback', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ status: 0, data: { ok: true, issues: [] } }))
      }
      return new Response(JSON.stringify({
        status: 0,
        data: { schema: { type: 'page', title: '订单管理', body: [] }, pages: [{ id: 'order-list', title: '订单管理' }] },
      }))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<JsonPanel cwd="/root/cszh/dsh-test" t={t} />)
    const textarea = await screen.findByRole('textbox')
    expect((textarea as HTMLTextAreaElement).value).toBe(
      JSON.stringify({ type: 'page', title: '订单管理', body: [] }, null, 2),
    )
    fireEvent.change(textarea, { target: { value: JSON.stringify({ type: 'page', title: '订单（改）', body: [] }) } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(screen.getByText('已保存并通过校验')).toBeTruthy()
    })
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(post).toBeDefined()
    const raw = post?.[1]?.body
    const posted = JSON.parse(typeof raw === 'string' ? raw : '{}') as {
      cwd: string
      page: string
      value: { type: string; title: string }
    }
    expect(posted).toEqual({
      cwd: '/root/cszh/dsh-test',
      page: 'order-list',
      value: { type: 'page', title: '订单（改）', body: [] },
    })
  })

  it('rejects invalid JSON and non-page content before saving', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      status: 0,
      data: { schema: { type: 'page' }, pages: [{ id: 'order-list', title: '订单管理' }] },
    })))
    vi.stubGlobal('fetch', fetchMock)
    render(<JsonPanel cwd="/root/cszh/dsh-test" t={t} />)
    const textarea = await screen.findByRole('textbox')
    fireEvent.change(textarea, { target: { value: '{broken' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('JSON 解析失败')).toBeTruthy()
    fireEvent.change(textarea, { target: { value: JSON.stringify({ type: 'crud' }) } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('内容必须是 page schema')).toBeTruthy()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('runs the package test suite and lists each case outcome', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      status: 0,
      data: {
        ok: false,
        cases: 2,
        passed: 1,
        failed: 1,
        results: [
          { name: 'order: insert', passed: true, message: 'ok' },
          { name: 'order: duplicate unique', passed: false, message: 'status 400 != 200' },
        ],
      },
    })))
    vi.stubGlobal('fetch', fetchMock)
    render(<TestsPanel cwd="/root/cszh/dsh-test" t={t} />)
    fireEvent.click(screen.getByRole('button', { name: '运行测试' }))
    await waitFor(() => {
      expect(screen.getByText(/通过 1\/2/)).toBeTruthy()
    })
    expect(screen.getByText(/order: duplicate unique/)).toBeTruthy()
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(post).toBeDefined()
    const raw = post?.[1]?.body
    expect(JSON.parse(typeof raw === 'string' ? raw : '{}')).toEqual({ cwd: '/root/cszh/dsh-test' })
  })

  it('creates, lists, and restores package versions', async () => {
    let snapshotted = false
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const raw = init?.body
      const body = JSON.parse(typeof raw === 'string' ? raw : '{}') as { action: string; version?: string }
      if (body.action === 'snapshot') {
        snapshotted = true
        return new Response(JSON.stringify({ status: 0, data: { ok: true, action: 'snapshot', version: 'v1' } }))
      }
      if (body.action === 'restore') {
        return new Response(JSON.stringify({ status: 0, data: { ok: true, action: 'restore', version: 'v1', restored: 4 } }))
      }
      return new Response(JSON.stringify({
        status: 0,
        data: { ok: true, action: 'list', versions: snapshotted ? ['v1'] : [] },
      }))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<VersionsPanel cwd="/root/cszh/dsh-test" t={t} />)
    expect(await screen.findByText('暂无版本快照')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '创建快照' }))
    expect(await screen.findByText(/已创建版本: v1/)).toBeTruthy()
    expect(await screen.findByText('v1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '恢复' }))
    expect(await screen.findByText('已恢复 4 个文件')).toBeTruthy()
  })

  it('publishes to the platform only after the two-step adoption confirm', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/uicp/preview/publish')) {
        const raw = init?.body
        const posted = JSON.parse(typeof raw === 'string' ? raw : '{}') as {
          adopted: boolean
          token: string
          tenantId: string
        }
        expect(posted.adopted).toBe(true)
        expect(posted.token).toBe('jwt')
        expect(posted.tenantId).toBe('t1')
        return new Response(JSON.stringify({
          status: 0,
          data: {
            ok: true,
            appId: 'app-1',
            created: { app: true, entities: 1, fields: 2, funcs: 0, menu: true, page: true },
          },
        }))
      }
      return new Response(JSON.stringify({
        status: 0,
        data: {
          ok: true,
          cases: 1,
          passed: 1,
          failed: 0,
          results: [{ name: 'order: insert', passed: true, message: 'ok' }],
        },
      }))
    })
    vi.stubGlobal('fetch', fetchMock)
    window.localStorage.setItem('uicp.platform.token', 'jwt')
    window.localStorage.setItem('uicp.platform.tenant', 't1')
    render(<TestsPanel cwd="/root/cszh/dsh-test" t={t} />)
    fireEvent.click(screen.getByRole('button', { name: '运行测试' }))
    const save = await screen.findByRole('button', { name: '采纳并保存到平台' })
    fireEvent.click(save)
    expect(screen.getByRole('button', { name: '再次点击确认' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '再次点击确认' }))
    await waitFor(() => {
      expect(screen.getByText(/已保存到平台 app=app-1/)).toBeTruthy()
    })
  })
})
