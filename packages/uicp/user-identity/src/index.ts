/**
 * UICP user identity seam: validates the platform JWT against the platform
 * self endpoint, caches the result per credential, and persists the user
 * record in an append-only JSONL so later surfaces can display user info
 * without re-validating. The credential hash keys the cache; the raw token
 * never touches the store or logs.
 * @module @deepseek-ai/dsh-uicp-user-identity
 */

import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { IncomingMessage } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

export const name = 'uicp-user-identity'
export const inject = ['webServer']

/** Production UICP platform base when the deployment names no override. */
const DEFAULT_PLATFORM_BASE = 'https://api.underwork.cn/uicp'
/** Platform endpoint answering the current user for one JWT. */
const DEFAULT_SELF_PATH = '/user/user/self'
/** How long a validated credential is trusted before re-checking the platform. */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000
/** Compact the JSONL once it holds more than this many records. */
const COMPACT_THRESHOLD = 512

/** User identity seam configuration. */
export interface Config {
  /** Platform API base; defaults to the production UICP endpoint. */
  platformBase?: string
  /** Platform self-check path; defaults to `/user/user/self`. */
  selfPath?: string
  /** Append-only JSONL holding user records; defaults under the dsh home. */
  usersFile?: string
  /** Credential cache lifetime in milliseconds. */
  cacheTtlMs?: number
}

/** One persisted user record, keyed by the platform user id. */
export interface UserRecord {
  userId: string
  name?: string
  /** The raw platform self payload, kept for later display surfaces. */
  profile: unknown
  seenAt: string
}

/** A validated credential snapshot and when it expires. */
interface CacheEntry {
  record: UserRecord
  expiresAt: number
}

/**
 * Derive the cache/store key from the JWT without keeping the raw credential.
 * @param token - the platform JWT.
 * @returns the SHA-256 hex digest of the token.
 */
export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Read the platform JWT from the Authorization header, or undefined. */
export function bearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization
  if (header === undefined) return undefined
  const [scheme, token, ...rest] = header.split(/\s+/)
  return scheme?.toLowerCase() === 'bearer' && token !== undefined && token !== '' && rest.length === 0
    ? token
    : undefined
}

/**
 * Append-only user store: one JSON record per line, last write per user id
 * wins on read; compaction rewrites the file with the latest record per user
 * once it grows past a threshold.
 */
export class UserStore {
  /**
   * @param file - the JSONL file path.
   */
  constructor(private readonly file: string) {}

  /** Append one user record. */
  async append(record: UserRecord): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    await appendFile(this.file, `${JSON.stringify(record)}\n`, 'utf8')
  }

  /**
   * Latest record per user id, scanning the file so the last write wins.
   * @returns the user records keyed by user id.
   */
  async latest(): Promise<Map<string, UserRecord>> {
    const records = new Map<string, UserRecord>()
    let text: string
    try {
      text = await readFile(this.file, 'utf8')
    } catch {
      return records
    }
    for (const line of text.split('\n')) {
      if (line === '') continue
      try {
        const record = JSON.parse(line) as UserRecord
        if (typeof record.userId === 'string' && record.userId !== '') records.set(record.userId, record)
      } catch {
        // A torn line from a crashed write is skipped; the next append repairs the stream.
      }
    }
    return records
  }

  /**
   * Rewrite the file with the latest record per user when it exceeds the
   * compaction threshold.
   */
  async maybeCompact(): Promise<void> {
    let text: string
    try {
      text = await readFile(this.file, 'utf8')
    } catch {
      return
    }
    if (text.split('\n').filter(line => line !== '').length <= COMPACT_THRESHOLD) return
    const records = await this.latest()
    await writeFile(this.file, `${[...records.values()].map(record => JSON.stringify(record)).join('\n')}\n`, 'utf8')
  }
}

/**
 * Ask the platform who the JWT belongs to.
 * @param token - the platform JWT.
 * @param platformBase - the platform API base.
 * @param selfPath - the self-check path.
 * @returns the resolved user record.
 * @throws when the platform rejects the token or returns no user id.
 */
export async function fetchUser(token: string, platformBase: string, selfPath: string): Promise<UserRecord> {
  const res = await fetch(`${platformBase}${selfPath}`, { headers: { Authorization: token } })
  if (!res.ok) throw new Error(`self check failed: HTTP ${res.status}`)
  const body = (await res.json()) as { status?: number; data?: Record<string, unknown> }
  if (body.status !== 0 || body.data === undefined) throw new Error('platform rejected the token')
  const profile = body.data
  const idValue = profile._id ?? profile.id ?? profile.userId ?? ''
  const userId = typeof idValue === 'string' || typeof idValue === 'number' ? String(idValue) : ''
  if (userId === '') throw new Error('platform user record carries no id')
  const name = typeof profile.name === 'string' && profile.name !== '' ? profile.name : undefined
  const record: UserRecord = { userId, profile, seenAt: new Date().toISOString() }
  if (name !== undefined) record.name = name
  return record
}

/** Options shared by the identity resolver factory. */
export interface UserResolverOptions {
  /** Platform API base; defaults to the production UICP endpoint. */
  platformBase?: string
  /** Platform self-check path; defaults to `/user/user/self`. */
  selfPath?: string
  /** Append-only JSONL holding user records; defaults under the dsh home. */
  usersFile?: string
  /** Credential cache lifetime in milliseconds. */
  cacheTtlMs?: number
}

/**
 * Build a JWT → user resolver with its own credential cache and user ledger.
 * Shared by the `/uicp/user/me` route and fork plugins that need the current
 * user id from a request.
 * @param options - resolver configuration.
 * @returns a resolver validating one token and persisting its user record.
 */
export function createUserResolver(options: UserResolverOptions = {}): (token: string) => Promise<UserRecord> {
  const platformBase = options.platformBase ?? DEFAULT_PLATFORM_BASE
  const selfPath = options.selfPath ?? DEFAULT_SELF_PATH
  const usersFile = options.usersFile ?? dshHomePath('uicp-users', 'users.jsonl')
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  const cache = new Map<string, CacheEntry>()
  const store = new UserStore(usersFile)
  return async (token) => {
    const key = tokenHash(token)
    const cached = cache.get(key)
    if (cached !== undefined && cached.expiresAt > Date.now()) return cached.record
    const record = await fetchUser(token, platformBase, selfPath)
    cache.set(key, { record, expiresAt: Date.now() + cacheTtlMs })
    await store.append(record)
    await store.maybeCompact()
    return record
  }
}

/**
 * Register the `/uicp/user/me` route: validate the JWT against the platform,
 * persist the user record, and answer the resolved user.
 * @param ctx - host context with the webserver.
 * @param config - seam configuration.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const resolveUser = createUserResolver(config)

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: '/uicp/user/me',
      handler: async (req, res) => {
        const json = (status: number, body: unknown): void => {
          res.writeHead(status, { 'content-type': 'application/json' })
          res.end(JSON.stringify(body))
        }
        const token = bearerToken(req)
        if (token === undefined) {
          json(401, { status: 401, msg: 'missing platform token', data: null })
          return
        }
        try {
          const user = await resolveUser(token)
          json(200, { status: 0, data: { user } })
        } catch {
          // The platform rejected the credential or is unreachable: the token
          // cannot identify a user, so the browser falls back to sign-in.
          json(401, { status: 401, msg: 'platform rejected the token', data: null })
        }
      },
    }),
    'uicp-user-identity: user route',
  )
}
