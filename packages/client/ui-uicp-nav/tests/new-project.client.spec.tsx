// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NewProjectForm } from '../src/client/NewProjectForm.tsx'
import { resetNav, setNavActions } from '../src/client/nav.ts'
import { resetAuth, setToken } from '../src/client/token.ts'

const t = (key: string): string => key

beforeEach(() => {
  resetAuth()
  resetNav()
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function authenticated(): Promise<void> {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    status: 0,
    data: { _id: 'u1', name: '张三' },
  }))))
  await setToken('tok')
}

function stubActions(): { createSession: ReturnType<typeof vi.fn> } {
  const createSession = vi.fn(async () => undefined)
  setNavActions({
    openSession: vi.fn(),
    createSession,
    renameSession: vi.fn(async () => undefined),
    forkSession: vi.fn(),
    archiveSession: vi.fn(async () => undefined),
    registerAppWorkspace: vi.fn(async () => undefined),
    deleteWorkspace: vi.fn(async () => undefined),
  })
  return { createSession }
}

describe('NewProjectForm', () => {
  it('expands from the footer trigger into the git form', async () => {
    await authenticated()
    const { container } = render(<NewProjectForm t={t as never} />)
    expect(screen.getByRole('button', { name: 'newProject.open' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'newProject.open' }))
    expect(screen.getByPlaceholderText('newProject.repoUrl')).toBeTruthy()
    expect(screen.getByPlaceholderText('newProject.password')).toBeTruthy()
    expect(container.querySelector('form')).not.toBeNull()
  })

  it('creates the project through the seam and opens a session', async () => {
    await authenticated()
    const { createSession } = stubActions()
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response(JSON.stringify({
      status: 0,
      data: { name: 'demo', path: '/root/projects/demo' },
    })))
    vi.stubGlobal('fetch', fetchMock)
    const { container } = render(<NewProjectForm t={t as never} />)
    fireEvent.click(screen.getByRole('button', { name: 'newProject.open' }))
    fireEvent.change(screen.getByPlaceholderText('newProject.repoUrl'), {
      target: { value: 'https://github.com/acme/demo.git' },
    })
    fireEvent.change(screen.getByPlaceholderText('newProject.name'), {
      target: { value: 'demo' },
    })
    fireEvent.change(screen.getByPlaceholderText('newProject.username'), {
      target: { value: 'wayne' },
    })
    fireEvent.change(screen.getByPlaceholderText('newProject.password'), {
      target: { value: 's3cret' },
    })
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => { expect(createSession).toHaveBeenCalledWith('/root/projects/demo') })
    const call = fetchMock.mock.calls[0]!
    expect(call[0]).toBe('/uicp/projects')
    const init = call[1]
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer tok' })
    const body = JSON.parse(init?.body as string) as Record<string, string>
    expect(body).toMatchObject({
      repoUrl: 'https://github.com/acme/demo.git',
      name: 'demo',
      username: 'wayne',
      password: 's3cret',
    })
    expect(screen.queryByPlaceholderText('newProject.repoUrl')).toBeNull()
  })

  it('shows the server message when creation fails', async () => {
    await authenticated()
    stubActions()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status: 400,
      msg: 'repoUrl is required',
      data: null,
    }))))
    const { container } = render(<NewProjectForm t={t as never} />)
    fireEvent.click(screen.getByRole('button', { name: 'newProject.open' }))
    fireEvent.change(screen.getByPlaceholderText('newProject.repoUrl'), {
      target: { value: '' },
    })
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => { expect(screen.getByText('repoUrl is required')).toBeTruthy() })
  })

  it('does nothing without an authenticated token and reports a missing path', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 0,
      data: { name: 'demo' },
    })))
    vi.stubGlobal('fetch', fetchMock)
    const { container } = render(<NewProjectForm t={t as never} />)
    fireEvent.click(screen.getByRole('button', { name: 'newProject.open' }))
    fireEvent.change(screen.getByPlaceholderText('newProject.repoUrl'), {
      target: { value: 'https://github.com/acme/demo.git' },
    })
    fireEvent.submit(container.querySelector('form')!)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('newProject.repoUrl')).toBeTruthy()

    await authenticated()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status: 0,
      data: { name: 'demo' },
    }))))
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => { expect(screen.getByText('create project failed')).toBeTruthy() })
  })

  it('closes the form from the cancel button', async () => {
    await authenticated()
    const { container } = render(<NewProjectForm t={t as never} />)
    fireEvent.click(screen.getByRole('button', { name: 'newProject.open' }))
    expect(container.querySelector('form')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'newProject.cancel' }))
    expect(container.querySelector('form')).toBeNull()
  })
})
