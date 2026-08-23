import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  apply as applyInvariant, inject as invariantInject, name as invariantName,
} from '../src/invariant.ts'
import { apply, internals } from '../src/index.ts'

const dirs: string[] = []
const originalRunGit = internals.runGit
let captures: Array<{ args: string[]; env: Record<string, string> }>
let askpassContents: Array<{ path: string; content: string }>

beforeEach(() => {
  captures = []
  askpassContents = []
  internals.runGit = async (args, options) => {
    captures.push({ args, env: options.env })
    if (options.env.GIT_ASKPASS !== undefined) {
      askpassContents.push({
        path: options.env.GIT_ASKPASS,
        content: await readFile(options.env.GIT_ASKPASS, 'utf8'),
      })
    }
    if (args[0] === 'clone') await mkdir(args[2]!, { recursive: true })
  }
})

afterEach(async () => {
  internals.runGit = originalRunGit
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'uicp-project-git-'))
  dirs.push(dir)
  return dir
}

function fakeReq(url: string, token = 'tok', method = 'GET'): IncomingMessage {
  return Object.assign(Readable.from([]), {
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
  }) as unknown as IncomingMessage
}

function fakePostReq(url: string, body: unknown, token = 'tok'): IncomingMessage {
  return Object.assign(Readable.from([JSON.stringify(body)]), {
    method: 'POST',
    url,
    headers: { authorization: `Bearer ${token}` },
  }) as unknown as IncomingMessage
}

function fakeRes(): { res: ServerResponse; captured: { statusCode: number; body: string } } {
  const captured = { statusCode: 0, body: '' }
  const res = {
    writeHead: (statusCode: number) => { captured.statusCode = statusCode },
    end: (body: string) => { captured.body = body },
  } as unknown as ServerResponse
  return { res, captured }
}

async function mountWith(config: { projectsRoot?: string }): Promise<{
  registrations: Array<{ path: string; handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }>
  credentials: {
    set: ReturnType<typeof vi.fn>
    resolve: ReturnType<typeof vi.fn>
    describe: ReturnType<typeof vi.fn>
  }
  dispose: () => Promise<void>
}> {
  const home = await tempDir()
  vi.stubEnv('DSH_HOME', home)
  const ctx = new Context()
  const registrations: Array<{
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  }> = []
  const credentials = {
    set: vi.fn(async () => {}),
    resolve: vi.fn(async () => undefined),
    describe: vi.fn(async () => ({ configured: false, writable: true })),
  }
  ctx.provide('webServer', {
    register: (registration: unknown) => {
      registrations.push(registration as typeof registrations[number])
      return () => {}
    },
  } as never)
  ctx.provide('credentials', credentials as never)
  apply(ctx, { platformBase: 'http://platform.test', ...config })
  return { registrations, credentials, dispose: () => ctx.fiber.dispose() }
}

function mount(projectsRoot: string): ReturnType<typeof mountWith> {
  return mountWith({ projectsRoot })
}

function mountDefault(): ReturnType<typeof mountWith> {
  return mountWith({})
}

function selfOk(): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    status: 0,
    data: { _id: 'u1', name: '张三' },
  }))))
}

describe('apply /uicp/projects', () => {
  it('runs the real git binary for local operations', async () => {
    const dir = await tempDir()
    await originalRunGit(['init'], { cwd: dir, env: {} })
    await expect(originalRunGit(['rev-parse', '--is-inside-work-tree'], { cwd: dir, env: {} })).resolves.toBeUndefined()
    const plain = await tempDir()
    await expect(originalRunGit(['status'], { cwd: plain, env: {} })).rejects.toThrow(/git status failed/)
  })

  it('answers 401 without a platform token', async () => {
    const { registrations, dispose } = await mount(await tempDir())
    const anonymous = Object.assign(Readable.from([]), {
      method: 'GET',
      url: '/uicp/projects',
      headers: {},
    }) as unknown as IncomingMessage
    const { res, captured } = fakeRes()
    await registrations[0]!.handler(anonymous, res)
    expect(captured.statusCode).toBe(401)
    await dispose()
  })

  it('answers 401 when the platform rejects the token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 401, msg: 'bad' }), { status: 401 })))
    const { registrations, dispose } = await mount(await tempDir())
    const { res, captured } = fakeRes()
    await registrations[0]!.handler(fakeReq('/uicp/projects'), res)
    expect(captured.statusCode).toBe(401)
    await dispose()
  })

  it('clones a public repository into the user project root', async () => {
    selfOk()
    const projectsRoot = await tempDir()
    const { registrations, credentials, dispose } = await mount(projectsRoot)
    const { res, captured } = fakeRes()
    await registrations[0]!.handler(
      fakePostReq('/uicp/projects', { repoUrl: 'https://github.com/acme/widgets.git' }),
      res,
    )
    expect(captured.statusCode).toBe(200)
    const body = JSON.parse(captured.body) as { data: { name: string; path: string } }
    expect(body.data.name).toBe('widgets')
    expect(body.data.path).toBe(join(projectsRoot, 'users', 'u1', 'projects', 'widgets'))
    expect(captures).toHaveLength(1)
    expect(captures[0]!.args).toEqual(['clone', 'https://github.com/acme/widgets.git', body.data.path])
    expect(captures[0]!.env.GIT_TERMINAL_PROMPT).toBe('0')
    expect(captures[0]!.env.GIT_ASKPASS).toBeUndefined()
    expect(credentials.set).not.toHaveBeenCalled()
    await dispose()
  })

  it('stores private-repo credentials and injects them through the askpass helper', async () => {
    selfOk()
    const projectsRoot = await tempDir()
    const { registrations, credentials, dispose } = await mount(projectsRoot)
    const { res, captured } = fakeRes()
    await registrations[0]!.handler(
      fakePostReq('/uicp/projects', {
        repoUrl: 'https://gitlab.example.com/team/secret.git',
        name: 'secret',
        username: 'wayne',
        password: 's3cret',
      }),
      res,
    )
    expect(captured.statusCode).toBe(200)
    expect(credentials.set).toHaveBeenCalledTimes(2)
    expect(credentials.set.mock.calls[0]![0]).toMatch(/^UWA_GIT_USER_[0-9a-f]{16}$/)
    expect(credentials.set.mock.calls[1]![1]).toBe('s3cret')
    const env = captures[0]!.env
    expect(env.UWA_GIT_USER).toBe('wayne')
    expect(env.UWA_GIT_PASS).toBe('s3cret')
    expect(env.GIT_ASKPASS).toBeTruthy()
    const script = askpassContents[0]!.content
    expect(script).toContain('UWA_GIT_USER')
    expect(script).not.toContain('s3cret')
    // The helper is removed after the clone.
    await expect(readFile(env.GIT_ASKPASS!, 'utf8')).rejects.toThrow()
    await dispose()
  })

  it('rejects traversal names, duplicate projects, and clone failures', async () => {
    selfOk()
    const projectsRoot = await tempDir()
    const { registrations, dispose } = await mount(projectsRoot)

    const badName = fakeRes()
    await registrations[0]!.handler(
      fakePostReq('/uicp/projects', { repoUrl: 'https://github.com/a/b.git', name: '../escape' }),
      badName.res,
    )
    expect(badName.captured.statusCode).toBe(400)

    const first = fakeRes()
    await registrations[0]!.handler(
      fakePostReq('/uicp/projects', { repoUrl: 'https://github.com/a/b.git' }),
      first.res,
    )
    expect(first.captured.statusCode).toBe(200)
    const dup = fakeRes()
    await registrations[0]!.handler(
      fakePostReq('/uicp/projects', { repoUrl: 'https://github.com/a/b.git' }),
      dup.res,
    )
    expect(dup.captured.statusCode).toBe(409)

    captures.length = 0
    internals.runGit = async () => { throw new Error('remote refused') }
    const failing = fakeRes()
    await registrations[0]!.handler(
      fakePostReq('/uicp/projects', { repoUrl: 'https://github.com/a/c.git', name: 'broken' }),
      failing.res,
    )
    expect(failing.captured.statusCode).toBe(500)
    await expect(readFile(join(projectsRoot, 'users', 'u1', 'projects', 'broken'), 'utf8')).rejects.toThrow()
    await dispose()
  })

  it('rejects an unsafe default name and a non-object body', async () => {
    selfOk()
    const { registrations, dispose } = await mount(await tempDir())
    const badUrl = fakeRes()
    await registrations[0]!.handler(
      fakePostReq('/uicp/projects', { repoUrl: 'https://github.com/a/..' }),
      badUrl.res,
    )
    expect(badUrl.captured.statusCode).toBe(400)
    const nonObject = fakeRes()
    await registrations[0]!.handler(
      fakePostReq('/uicp/projects', 'x'),
      nonObject.res,
    )
    expect(nonObject.captured.statusCode).toBe(400)
    const missingUrl = fakeRes()
    await registrations[0]!.handler(
      fakePostReq('/uicp/projects', { name: 'no-url' }),
      missingUrl.res,
    )
    expect(missingUrl.captured.statusCode).toBe(400)
    await dispose()
  })

  it('rejects an empty or malformed JSON body', async () => {
    selfOk()
    const { registrations, dispose } = await mount(await tempDir())
    const empty = Object.assign(Readable.from([]), {
      method: 'POST',
      url: '/uicp/projects',
      headers: { authorization: 'Bearer tok' },
    }) as unknown as IncomingMessage
    const emptyRes = fakeRes()
    await registrations[0]!.handler(empty, emptyRes.res)
    expect(emptyRes.captured.statusCode).toBe(400)
    const malformed = Object.assign(Readable.from(['not json']), {
      method: 'POST',
      url: '/uicp/projects',
      headers: { authorization: 'Bearer tok' },
    }) as unknown as IncomingMessage
    const malformedRes = fakeRes()
    await registrations[0]!.handler(malformed, malformedRes.res)
    expect(malformedRes.captured.statusCode).toBe(400)
    await dispose()
  })

  it('defaults the projects root under the dsh home', async () => {
    selfOk()
    const { registrations, dispose } = await mountDefault()
    const { res, captured } = fakeRes()
    await registrations[0]!.handler(
      fakePostReq('/uicp/projects', { repoUrl: 'https://github.com/acme/defaults.git' }),
      res,
    )
    expect(captured.statusCode).toBe(200)
    const body = JSON.parse(captured.body) as { data: { path: string } }
    expect(body.data.path.endsWith(join('uicp-projects', 'users', 'u1', 'projects', 'defaults'))).toBe(true)
    await dispose()
  })

  it('lists the current user projects', async () => {
    selfOk()
    const projectsRoot = await tempDir()
    const { registrations, dispose } = await mount(projectsRoot)
    const alpha = join(projectsRoot, 'users', 'u1', 'projects', 'alpha')
    await mkdir(alpha, { recursive: true })
    await writeFile(join(alpha, 'README.md'), 'x')
    const { res, captured } = fakeRes()
    await registrations[0]!.handler(fakeReq('/uicp/projects'), res)
    expect(captured.statusCode).toBe(200)
    const body = JSON.parse(captured.body) as { data: { projects: Array<{ name: string; path: string }> } }
    expect(body.data.projects.map(project => project.name)).toEqual(['alpha'])
    expect(body.data.projects[0]!.path).toContain('u1')
    await dispose()
  })

  it('pulls a project with stored credentials', async () => {
    selfOk()
    const projectsRoot = await tempDir()
    const { registrations, credentials, dispose } = await mount(projectsRoot)
    const projectDir = join(projectsRoot, 'users', 'u1', 'projects', 'alpha')
    await mkdir(projectDir, { recursive: true })
    credentials.resolve
      .mockResolvedValueOnce({ value: 'wayne', source: 'store' })
      .mockResolvedValueOnce({ value: 's3cret', source: 'store' })
    const { res, captured } = fakeRes()
    await registrations[1]!.handler(
      fakePostReq('/uicp/projects/alpha/pull', {}),
      res,
    )
    expect(captured.statusCode).toBe(200)
    expect(captures).toHaveLength(1)
    expect(captures[0]!.args).toEqual(['pull'])
    expect(captures[0]!.env.UWA_GIT_USER).toBe('wayne')
    expect(captures[0]!.env.UWA_GIT_PASS).toBe('s3cret')
    expect(captures[0]!.env.GIT_ASKPASS).toBeTruthy()
    await expect(readFile(captures[0]!.env.GIT_ASKPASS!, 'utf8')).rejects.toThrow()
    await dispose()
  })

  it('pulls a public project without credentials and answers 404 for missing projects and unknown actions', async () => {
    selfOk()
    const projectsRoot = await tempDir()
    const { registrations, dispose } = await mount(projectsRoot)
    const projectDir = join(projectsRoot, 'users', 'u1', 'projects', 'public')
    await mkdir(projectDir, { recursive: true })
    const ok = fakeRes()
    await registrations[1]!.handler(fakePostReq('/uicp/projects/public/pull', {}), ok.res)
    expect(ok.captured.statusCode).toBe(200)
    expect(captures[0]!.env.GIT_ASKPASS).toBeUndefined()
    const missing = fakeRes()
    await registrations[1]!.handler(fakePostReq('/uicp/projects/nope/pull', {}), missing.res)
    expect(missing.captured.statusCode).toBe(404)
    const unknown = fakeRes()
    await registrations[1]!.handler(fakePostReq('/uicp/projects/public/rebuild', {}), unknown.res)
    expect(unknown.captured.statusCode).toBe(404)
    const anonymous = Object.assign(Readable.from([]), {
      method: 'POST',
      url: '/uicp/projects/public/pull',
      headers: {},
    }) as unknown as IncomingMessage
    const anonymousRes = fakeRes()
    await registrations[1]!.handler(anonymous, anonymousRes.res)
    expect(anonymousRes.captured.statusCode).toBe(401)
    const noUrl = Object.assign(Readable.from([]), {
      method: 'POST',
      headers: { authorization: 'Bearer tok' },
    }) as unknown as IncomingMessage
    const noUrlRes = fakeRes()
    await registrations[1]!.handler(noUrl, noUrlRes.res)
    expect(noUrlRes.captured.statusCode).toBe(404)
    await dispose()
  })

  it('answers 405 for other methods', async () => {
    selfOk()
    const { registrations, dispose } = await mount(await tempDir())
    const { res, captured } = fakeRes()
    await registrations[0]!.handler(fakeReq('/uicp/projects', 'tok', 'PUT'), res)
    expect(captured.statusCode).toBe(405)
    await dispose()
  })
})

describe('invariant companion', () => {
  it('registers under the package name with an empty installer', async () => {
    const registered: string[] = []
    const ctx = {
      invariants: {
        register: (pkg: string, installer: unknown) => {
          registered.push(pkg)
          expect(typeof installer).toBe('function')
          ;(installer as () => void)()
          return () => {}
        },
      },
    } as never
    await applyInvariant(ctx)
    expect(registered).toEqual(['@deepseek-ai/dsh-uicp-project-git'])
    expect(invariantName).toBe('uicp-project-git-invariant')
    expect(invariantInject).toEqual(['invariants'])
  })
})
