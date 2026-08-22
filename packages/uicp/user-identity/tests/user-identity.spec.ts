import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  apply as applyInvariant, inject as invariantInject, name as invariantName,
} from '../src/invariant.ts'
import {
  apply, fetchUser, tokenHash, UserStore, type UserRecord,
} from '../src/index.ts'

const dirs: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

async function tempFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'uicp-user-identity-'))
  dirs.push(dir)
  return join(dir, 'users.jsonl')
}

function fakeReq(url: string, token?: string): IncomingMessage {
  const headers: Record<string, string> = {}
  if (token !== undefined) headers.authorization = `Bearer ${token}`
  return Object.assign(Readable.from([]), { method: 'GET', url, headers }) as unknown as IncomingMessage
}

function fakeRes(): { res: ServerResponse; captured: { statusCode: number; body: string } } {
  const captured = { statusCode: 0, body: '' }
  const res = {
    writeHead: (statusCode: number) => { captured.statusCode = statusCode },
    end: (body: string) => { captured.body = body },
  } as unknown as ServerResponse
  return { res, captured }
}

function selfOk(payload: Record<string, unknown>): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 0, data: payload }))))
}

async function mount(config: { platformBase?: string; usersFile?: string } = {}): Promise<{
  registrations: Array<{ path: string; handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }>
  dispose: () => Promise<void>
}> {
  const ctx = new Context()
  const registrations: Array<{
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  }> = []
  ctx.provide('webServer', {
    register: (registration: unknown) => {
      registrations.push(registration as typeof registrations[number])
      return () => {}
    },
  } as never)
  apply(ctx, config)
  return { registrations, dispose: () => ctx.fiber.dispose() }
}

describe('tokenHash', () => {
  it('derives a stable hex digest without echoing the token', () => {
    const first = tokenHash('secret-token')
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(tokenHash('secret-token')).toBe(first)
    expect(tokenHash('other-token')).not.toBe(first)
  })
})

describe('UserStore', () => {
  it('persists records and lets the last write per user win', async () => {
    const file = await tempFile()
    const store = new UserStore(file)
    await store.append({ userId: 'u1', name: '第一', profile: {}, seenAt: '2026-08-22T00:00:00.000Z' })
    await store.append({ userId: 'u1', name: '最新', profile: {}, seenAt: '2026-08-22T01:00:00.000Z' })
    await store.append({ userId: 'u2', name: '第二', profile: {}, seenAt: '2026-08-22T02:00:00.000Z' })
    const latest = await store.latest()
    expect(latest.get('u1')?.name).toBe('最新')
    expect(latest.get('u2')?.name).toBe('第二')
    expect(latest.size).toBe(2)
  })

  it('compacts the JSONL once it exceeds the threshold', async () => {
    const file = await tempFile()
    const store = new UserStore(file)
    const record = (userId: string): UserRecord => ({ userId, name: userId, profile: {}, seenAt: '2026-08-22T00:00:00.000Z' })
    for (let index = 0; index < 520; index += 1) {
      await store.append(record(index % 2 === 0 ? 'u1' : 'u2'))
    }
    await store.maybeCompact()
    const lines = (await readFile(file, 'utf8')).trim().split('\n')
    expect(lines).toHaveLength(2)
    expect((await store.latest()).size).toBe(2)
  })

  it('returns an empty map for a missing file and skips records without a user id', async () => {
    const file = await tempFile()
    const store = new UserStore(file)
    expect((await store.latest()).size).toBe(0)
    await store.maybeCompact()
    await writeFile(file, `${JSON.stringify({ name: '无名' })}\n`, 'utf8')
    expect((await store.latest()).size).toBe(0)
  })
})

describe('fetchUser', () => {
  it('maps the platform self payload to a user record', async () => {
    selfOk({ _id: 'u1', name: '张三', avatar: '/a.png' })
    const record = await fetchUser('tok', 'http://platform.test', '/user/user/self')
    expect(record.userId).toBe('u1')
    expect(record.name).toBe('张三')
    expect((record.profile as { avatar: string }).avatar).toBe('/a.png')
  })

  it('falls back to id/userId keys and rejects payloads without an id', async () => {
    selfOk({ id: 'u2' })
    expect((await fetchUser('tok', 'http://platform.test', '/user/user/self')).userId).toBe('u2')
    selfOk({ _id: 42 })
    expect((await fetchUser('tok', 'http://platform.test', '/user/user/self')).userId).toBe('42')
    selfOk({ name: '无名' })
    await expect(fetchUser('tok', 'http://platform.test', '/user/user/self')).rejects.toThrow('carries no id')
    selfOk({ _id: { nested: true } })
    await expect(fetchUser('tok', 'http://platform.test', '/user/user/self')).rejects.toThrow('carries no id')
  })

  it('rejects a non-zero status and a payload without data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 500, msg: 'x' }))))
    await expect(fetchUser('tok', 'http://platform.test', '/user/user/self')).rejects.toThrow('platform rejected')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 0 }))))
    await expect(fetchUser('tok', 'http://platform.test', '/user/user/self')).rejects.toThrow('platform rejected')
  })
})

describe('apply /uicp/user/me', () => {
  it('answers 401 without a platform token', async () => {
    const { registrations, dispose } = await mount({ platformBase: 'http://platform.test', usersFile: await tempFile() })
    const { res, captured } = fakeRes()
    await registrations[0]!.handler(fakeReq('/uicp/user/me'), res)
    expect(captured.statusCode).toBe(401)
    await dispose()
  })

  it('answers 401 for a malformed Authorization header', async () => {
    const { registrations, dispose } = await mount({ platformBase: 'http://platform.test', usersFile: await tempFile() })
    const req = Object.assign(Readable.from([]), {
      method: 'GET',
      url: '/uicp/user/me',
      headers: { authorization: 'Basic abc' },
    }) as unknown as IncomingMessage
    const { res, captured } = fakeRes()
    await registrations[0]!.handler(req, res)
    expect(captured.statusCode).toBe(401)
    await dispose()
  })

  it('resolves the user from the platform, persists it, and caches per credential', async () => {
    const usersFile = await tempFile()
    const { registrations, dispose } = await mount({ platformBase: 'http://platform.test', usersFile })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 0,
      data: { _id: 'u1', name: '张三' },
    })))
    vi.stubGlobal('fetch', fetchMock)

    const first = fakeRes()
    await registrations[0]!.handler(fakeReq('/uicp/user/me', 'tok-a'), first.res)
    expect(first.captured.statusCode).toBe(200)
    const firstBody = JSON.parse(first.captured.body) as { data: { user: UserRecord } }
    expect(firstBody.data.user.userId).toBe('u1')
    expect(firstBody.data.user.name).toBe('张三')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const second = fakeRes()
    await registrations[0]!.handler(fakeReq('/uicp/user/me', 'tok-a'), second.res)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const stored = JSON.parse(await readFile(usersFile, 'utf8')) as UserRecord
    expect(stored.userId).toBe('u1')
    await dispose()
  })

  it('keeps users apart and answers 401 when the platform rejects the token', async () => {
    const usersFile = await tempFile()
    const { registrations, dispose } = await mount({ platformBase: 'http://platform.test', usersFile })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 0,
      data: { _id: 'u1', name: '张三' },
    })))
    vi.stubGlobal('fetch', fetchMock)

    const first = fakeRes()
    await registrations[0]!.handler(fakeReq('/uicp/user/me', 'tok-a'), first.res)
    expect((JSON.parse(first.captured.body) as { data: { user: UserRecord } }).data.user.userId).toBe('u1')

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      status: 0,
      data: { _id: 'u2', name: '李四' },
    })))
    const second = fakeRes()
    await registrations[0]!.handler(fakeReq('/uicp/user/me', 'tok-b'), second.res)
    expect((JSON.parse(second.captured.body) as { data: { user: UserRecord } }).data.user.userId).toBe('u2')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: 401, msg: 'bad' }), { status: 401 }))
    const rejected = fakeRes()
    await registrations[0]!.handler(fakeReq('/uicp/user/me', 'tok-bad'), rejected.res)
    expect(rejected.captured.statusCode).toBe(401)
    await dispose()
  })

  it('applies default config and persists under the dsh home', async () => {
    const home = await mkdtemp(join(tmpdir(), 'uicp-user-home-'))
    dirs.push(home)
    vi.stubEnv('DSH_HOME', home)
    const { registrations, dispose } = await mount({})
    selfOk({ _id: 'u1', name: '默认' })
    const { res, captured } = fakeRes()
    await registrations[0]!.handler(fakeReq('/uicp/user/me', 'tok'), res)
    expect(captured.statusCode).toBe(200)
    expect(await readFile(join(home, 'uicp-users', 'users.jsonl'), 'utf8')).toContain('"userId":"u1"')
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
    expect(registered).toEqual(['@deepseek-ai/dsh-uicp-user-identity'])
    expect(invariantName).toBe('uicp-user-identity-invariant')
    expect(invariantInject).toEqual(['invariants'])
  })
})
