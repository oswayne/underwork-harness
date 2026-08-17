// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { zh } from '../src/locales.ts'
import { AppPackageWorkspace } from '../src/client/AppPackageWorkspace.tsx'
import type { AppPackageWorkspaceInjected } from '../src/client/AppPackageWorkspace.tsx'
import { PreviewPanel } from '../src/client/PreviewPanel.tsx'
import { EditorPanel } from '../src/client/EditorPanel.tsx'

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

  it('mounts the editor and writes the edited schema back with validation feedback', async () => {
    type EditorMount = (
      container: Element,
      schema: unknown,
      env: { onSave: (value: unknown) => void },
    ) => { save: () => void; unmount: () => void }
    let onSave: ((value: unknown) => void) | undefined
    const mount = vi.fn<EditorMount>((_container, _schema, env) => {
      onSave = env.onSave
      return { save: () => { onSave?.({ type: 'page', title: '订单（改）', body: [] }) }, unmount: vi.fn() }
    })
    ;(window as { UicpEurekaPreview?: unknown }).UicpEurekaPreview = { mountEurekaEditor: mount }
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ status: 0, data: { ok: true, issues: [] } }))
      }
      return new Response(JSON.stringify({
        status: 0,
        data: { schema: { type: 'page', title: '订单管理' }, pages: [{ id: 'order-list', title: '订单管理' }] },
      }))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<AppPackageWorkspace {...props('/root/cszh/dsh-test')} />)
    fireEvent.click(screen.getByRole('tab', { name: '编辑' }))
    await waitFor(() => {
      expect(mount).toHaveBeenCalled()
    })
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
      value: { type: string; title: string; body: unknown[] }
    }
    expect(posted).toEqual({
      cwd: '/root/cszh/dsh-test',
      page: 'order-list',
      value: { type: 'page', title: '订单（改）', body: [] },
    })
  })

  it('shows validation findings after a non-conforming save', async () => {
    type EditorMount = (
      container: Element,
      schema: unknown,
      env: { onSave: (value: unknown) => void },
    ) => { save: () => void; unmount: () => void }
    let onSave: ((value: unknown) => void) | undefined
    const mount = vi.fn<EditorMount>((_container, _schema, env) => {
      onSave = env.onSave
      return { save: () => { onSave?.({ type: 'page' }) }, unmount: vi.fn() }
    })
    ;(window as { UicpEurekaPreview?: unknown }).UicpEurekaPreview = { mountEurekaEditor: mount }
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({
          status: 0,
          data: {
            ok: false,
            issues: [{ severity: 'error', file: 'pages/order-list.json', rule: 'page.schema', message: 'Eureka schema 校验失败' }],
          },
        }))
      }
      return new Response(JSON.stringify({
        status: 0,
        data: { schema: { type: 'page' }, pages: [{ id: 'order-list', title: '订单管理' }] },
      }))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<EditorPanel cwd="/root/cszh/dsh-test" t={t} />)
    await waitFor(() => {
      expect(mount).toHaveBeenCalled()
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(screen.getByText(/Eureka schema 校验失败/)).toBeTruthy()
    })
  })
})
