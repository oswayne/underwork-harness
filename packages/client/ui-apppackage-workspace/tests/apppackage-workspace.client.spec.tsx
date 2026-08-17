// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { zh } from '../src/locales.ts'
import { AppPackageWorkspace } from '../src/client/AppPackageWorkspace.tsx'
import { PreviewPanel } from '../src/client/PreviewPanel.tsx'

const t = ((key: string) => zh[key as keyof typeof zh] ?? key) as never

function props(cwd: string | undefined) {
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
  return { t, useSessions } as unknown as PropsRuntime<'details'> & PropsLocale<'apppackage'>
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
    expect(screen.getByRole('tab', { name: '渲染预览' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '可视化编辑' }).hasAttribute('disabled')).toBe(true)
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
})
