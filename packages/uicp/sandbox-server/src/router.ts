/** REST dispatcher mirroring uicp `DataController` + `SchemaController.func`. */

import type { SandboxEntity, SandboxFunc, SandboxRequest, SandboxResponse } from './types.ts'
import { SandboxError, SandboxStore } from './store.ts'
import { applyQuery, buildTree, pathPrefixRows, sumField } from './query.ts'
import { SandboxExecutor } from './executor.ts'

/** Dependencies shared by the sandbox REST dispatcher. */
export interface SandboxRouterDeps {
  store: SandboxStore
  executor: SandboxExecutor
  entities: ReadonlyMap<string, SandboxEntity>
  funcs: ReadonlyMap<string, SandboxFunc[]>
}

function ok(data: unknown): SandboxResponse {
  return { statusCode: 200, body: { status: 0, msg: '', data } }
}

/** Dispatch sandbox requests to CRUD/query/stats/tree/func handlers. */
export class SandboxRouter {
  constructor(private readonly deps: SandboxRouterDeps) {}

  /**
   * Dispatch one sandbox request to its handler.
   * @param request - the parsed sandbox REST request.
   * @returns the canonical sandbox response.
   */
  async handle(request: SandboxRequest): Promise<SandboxResponse> {
    try {
      return await this.dispatch(request)
    } catch (error) {
      if (error instanceof SandboxError) {
        return { statusCode: error.statusCode, body: { status: error.statusCode, msg: error.message, data: {} } }
      }
      const message = error instanceof Error ? error.message : String(error)
      return { statusCode: 500, body: { status: 500, msg: '操作失败', data: message } }
    }
  }

  private async dispatch(request: SandboxRequest): Promise<SandboxResponse> {
    const segments = request.path.split('/').filter(segment => segment.length > 0)
    const identifier = segments[0]
    if (identifier === undefined) throw new SandboxError(404, '路径不存在')
    const entity = this.requireEntity(identifier)
    const rest = segments.slice(1)
    const method = request.method.toUpperCase()
    const fields = new Map(entity.fields.map(field => [field.name, field]))
    const store = this.deps.store

    if (method === 'GET' && rest.length === 0) {
      const outcome = applyQuery(await store.list(identifier), request.query, fields)
      return ok(outcome.items[0] ?? null)
    }
    if (method === 'GET' && rest.length === 1 && rest[0] === 'list') {
      const outcome = applyQuery(await store.list(identifier), request.query, fields)
      return ok(outcome.items)
    }
    if (method === 'GET' && rest.length === 1 && rest[0] === 'page') {
      const outcome = applyQuery(await store.list(identifier), request.query, fields)
      return ok({ items: outcome.items, total: outcome.total, page: outcome.page })
    }
    if (method === 'GET' && rest.length === 1 && rest[0] === 'tree') {
      this.requireTree(entity)
      const outcome = applyQuery(await store.list(identifier), request.query, fields)
      return ok(buildTree(outcome.items))
    }
    if (method === 'GET' && rest.length === 3 && rest[0] === 'tree' && rest[2] === 'branch') {
      this.requireTree(entity)
      const rows = pathPrefixRows(await store.list(identifier), rest[1])
      if (rows.length === 0) return { statusCode: 404, body: { status: 404, msg: '分支为空', data: [] } }
      return ok(buildTree(rows))
    }
    if (method === 'GET' && rest.length === 1) {
      return ok(await store.findById(identifier, rest[0]))
    }
    if (method === 'POST' && rest.length === 0) {
      const record = this.requireObject(request.body)
      await this.runConstructors(identifier, record)
      return ok(await store.insert(identifier, record))
    }
    if (method === 'POST' && rest.length === 1 && rest[0] === 'batch') {
      if (!Array.isArray(request.body)) throw new SandboxError(400, 'batch 需要记录数组')
      return ok(await store.insertBatch(identifier, request.body as Record<string, unknown>[]))
    }
    if (method === 'POST' && rest.length === 2 && rest[0] === 'tree' && rest[1] === 'branch') {
      this.requireTree(entity)
      const record = this.requireObject(request.body)
      return ok(await store.insert(identifier, record))
    }
    if (method === 'PATCH' && rest.length === 1) {
      await store.update(identifier, rest[0], this.requireObject(request.body))
      return ok(rest[0])
    }
    if (method === 'DELETE' && rest.length === 1 && rest[0] === 'data') {
      const outcome = applyQuery(await store.list(identifier), request.query, fields)
      return ok(await store.removeMany(identifier, outcome.items.map(item => item._id)))
    }
    if (method === 'DELETE' && rest.length === 2 && rest[1] === 'branch') {
      const rows = pathPrefixRows(await store.list(identifier), rest[0])
      return ok(await store.removeMany(identifier, rows.map(row => row._id)))
    }
    if (method === 'DELETE' && rest.length === 1) {
      await store.removeById(identifier, rest[0])
      return ok(rest[0])
    }
    if (method === 'GET' && rest.length === 2 && rest[0] === 'stats' && rest[1] === 'count') {
      const outcome = applyQuery(await store.list(identifier), request.query, fields)
      return ok(outcome.total)
    }
    if (method === 'GET' && rest.length === 3 && rest[0] === 'stats' && rest[2] === 'sum') {
      const outcome = applyQuery(await store.list(identifier), request.query, fields)
      return ok(sumField(outcome.items, rest[1] as string))
    }
    if (method === 'POST' && rest.length === 2 && rest[0] === 'func') {
      const result = await this.deps.executor.call(identifier, rest[1] as string)
      return { statusCode: result.status === 0 ? 200 : result.status, body: { status: result.status, msg: result.msg ?? '', data: result.data } }
    }
    if (method === 'POST' && (rest.length === 3 || rest.length === 4) && rest[1] === 'func') {
      const result = await this.deps.executor.call(identifier, rest[2] as string, rest[0])
      return { statusCode: result.status === 0 ? 200 : result.status, body: { status: result.status, msg: result.msg ?? '', data: result.data } }
    }
    throw new SandboxError(404, '路径不存在')
  }

  private requireEntity(identifier: string): SandboxEntity {
    const entity = this.deps.entities.get(identifier)
    if (entity === undefined) throw new SandboxError(404, `${identifier} 不存在`)
    return entity
  }

  private requireTree(entity: SandboxEntity): void {
    if (!entity.tree) throw new SandboxError(400, '该表单不支持树形结构查询')
  }

  private requireObject(body: unknown): Record<string, unknown> {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new SandboxError(400, '请求体必须是对象')
    return body as Record<string, unknown>
  }

  private async runConstructors(identifier: string, record: Record<string, unknown>): Promise<void> {
    for (const func of this.deps.funcs.get(identifier) ?? []) {
      if (func.type !== 'constructor') continue
      const result = await this.deps.executor.execute(func.body, record)
      if (result.status !== 0) throw new SandboxError(result.status === 500 ? 500 : result.status, result.msg ?? '构造函数未通过')
    }
  }
}
