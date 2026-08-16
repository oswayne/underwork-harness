/**
 * Host plugin: uicp data sandbox on `ctx.webServer` + `ctx.storage`. Serves
 * `/app-package/entity/...` REST semantics and a mock upload endpoint so Eureka
 * pages preview against local data with the same paths the platform uses.
 * @module @deepseek-ai/dsh-sandbox-server
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { KvFacet, KvUnit } from '@deepseek-ai/dsh-storage'
import type { KvBackend, SandboxEntity, SandboxFunc, SandboxRequest, SandboxResponse } from './types.ts'
import { SandboxError, SandboxStore, tableName } from './store.ts'
import { SandboxRouter } from './router.ts'
import { SandboxExecutor } from './executor.ts'

export const name = 'sandbox-server'
export const inject = ['webServer', 'storage']

/** Sandbox plugin configuration. */
export interface Config {
  /** Absolute path of the app-package directory whose entities/funcs to serve. */
  packageDir: string
  /** Data partition; defaults to `default` and derives the storage unit name. */
  session?: string
  /** Body size cap for writes; defaults to 4 MiB. */
  maxBodyBytes?: number
  /** ctx.storage backend name exposing the KV facet; defaults to `json`. */
  backendName?: string
}

/**
 * Register the sandbox routes. Reads are served from the app-package's entity
 * and func definitions; data persists through `ctx.storage` per session.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.packageDir === '') throw new Error('sandbox-server: packageDir is required')
  const session = config.session ?? 'default'
  const maxBodyBytes = config.maxBodyBytes ?? 4 * 1024 * 1024
  const kv = ctx.storage.backend.get(config.backendName ?? 'json').kv
  if (kv === undefined) throw new Error(`sandbox-server: storage backend ${config.backendName ?? 'json'} exposes no KV facet`)
  const { entities, funcs } = loadPackage(config.packageDir)
  const unitName = `uicp_sandbox_${session.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`
  const backend = new StorageBackend(kv, unitName, entities)
  const store = new SandboxStore(backend, entities)
  const executor = new SandboxExecutor(store, funcs)
  const router = new SandboxRouter({ store, executor, entities, funcs })
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: '/app-package/entity',
      handler: (req: IncomingMessage, res: ServerResponse) => routeAdapter(req, res, router, maxBodyBytes),
    }),
    'uicp-sandbox: data routes',
  )
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: '/app-package/upload',
      handler: (_req: IncomingMessage, res: ServerResponse) => { uploadMock(res) },
    }),
    'uicp-sandbox: upload mock',
  )
}

/** Read an app-package directory's entities and funcs from disk. */
export function loadPackage(packageDir: string): {
  entities: Map<string, SandboxEntity>
  funcs: Map<string, SandboxFunc[]>
} {
  const entities = new Map<string, SandboxEntity>()
  for (const file of readdirSync(join(packageDir, 'entities')).filter(name => name.endsWith('.json'))) {
    const entity = JSON.parse(readFileSync(join(packageDir, 'entities', file), 'utf8')) as SandboxEntity
    entities.set(entity.identifier, entity)
  }
  const funcs = new Map<string, SandboxFunc[]>()
  const funcsRoot = join(packageDir, 'funcs')
  for (const entityDir of readdirSync(funcsRoot)) {
    const full = join(funcsRoot, entityDir)
    const list: SandboxFunc[] = []
    for (const file of readdirSync(full).filter(name => name.endsWith('.js'))) {
      const identifier = file.slice(0, -'.js'.length)
      const meta = JSON.parse(readFileSync(join(full, `${identifier}.meta.json`), 'utf8')) as {
        name?: string
        type?: string
        comment?: string
      }
      const func: SandboxFunc = {
        identifier,
        name: meta.name ?? identifier,
        type: meta.type === 'object' || meta.type === 'constructor' ? meta.type : 'static',
        body: readFileSync(join(full, file), 'utf8'),
      }
      if (meta.comment !== undefined) func.comment = meta.comment
      list.push(func)
    }
    if (list.length > 0) funcs.set(entityDir, list)
  }
  return { entities, funcs }
}

/** `ctx.storage` KV backend adapter, one unit per session. */
class StorageBackend implements KvBackend {
  private unitPromise: Promise<KvUnit> | undefined

  constructor(
    private readonly kv: KvFacet,
    private readonly unitName: string,
    private readonly entities: ReadonlyMap<string, SandboxEntity>,
  ) {}

  private unit(): Promise<KvUnit> {
    if (this.unitPromise === undefined) {
      this.unitPromise = this.kv.open({
        name: this.unitName,
        version: 1,
        tables: [...this.entities.keys()].map(tableName),
        hasGlobal: false,
      })
    }
    return this.unitPromise
  }

  async loadAll(): Promise<{ tables: Record<string, Record<string, unknown>>; global: unknown }> {
    return (await this.unit()).loadAll()
  }

  async putRecord(table: string, key: string, value: unknown): Promise<void> {
    await (await this.unit()).putRecord(table, key, value)
  }

  async deleteRecord(table: string, key: string): Promise<void> {
    await (await this.unit()).deleteRecord(table, key)
  }
}

/** Mock upload endpoint so upload components preview without real uploads. */
export function uploadMock(res: ServerResponse): void {
  writeJson(res, 200, { status: 0, msg: '', data: { url: 'mock://upload' } })
}

async function routeAdapter(
  req: IncomingMessage,
  res: ServerResponse,
  router: SandboxRouter,
  maxBodyBytes: number,
): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://sandbox.local')
    const query: Record<string, string | string[] | undefined> = {}
    for (const key of url.searchParams.keys()) {
      const values = url.searchParams.getAll(key)
      query[key] = values.length === 1 ? values[0] : values
    }
    const rawBody = req.method === 'GET' || req.method === 'HEAD' ? '' : await readBody(req, maxBodyBytes)
    let body: unknown
    try {
      body = rawBody === '' ? undefined : JSON.parse(rawBody) as unknown
    } catch {
      body = undefined
    }
    const path = url.pathname.replace(/^\/app-package\/entity/, '')
    const request: SandboxRequest = {
      method: req.method ?? 'GET',
      path,
      query,
      body,
      session: typeof query.__session === 'string' ? query.__session : 'default',
    }
    const response: SandboxResponse = await router.handle(request)
    writeJson(res, response.statusCode, response.body)
  } catch (error) {
    // readBody is the only throwing call in this scope and throws SandboxError
    // only; router.handle converts everything else into a SandboxResponse.
    const sandboxError = error as SandboxError
    writeJson(res, sandboxError.statusCode, { status: sandboxError.statusCode, msg: sandboxError.message, data: {} })
  }
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk as string | Uint8Array)
    size += buffer.length
    if (size > maxBytes) throw new SandboxError(413, '请求体超限')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}
