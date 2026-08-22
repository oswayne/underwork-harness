/** vm-based Func executor mirroring uicp `Func.exec` with the internal vocabulary. */

import vm from 'node:vm'
import { createHash, randomBytes } from 'node:crypto'
import type { SandboxFunc } from './types.ts'
import { SandboxStore } from './store.ts'
import { matches } from './query.ts'

/** Canonical sandbox function-execution result. */
export interface ExecResult {
  status: number
  msg: string | null
  data: unknown
}

class ObjectIdValue {
  constructor(readonly hex: string = randomBytes(12).toString('hex')) {}

  toString(): string {
    return this.hex
  }
}

class DecimalValue {
  constructor(value: number | string) {
    this.value = Number(value)
  }

  readonly value: number

  plus(addend: number | string): DecimalValue {
    return new DecimalValue(this.value + Number(addend))
  }

  toNumber(): number {
    return this.value
  }

  toString(): string {
    return String(this.value)
  }
}

/** Execute Func bodies against the sandbox store in a frozen vm context. */
export class SandboxExecutor {
  constructor(
    private readonly store: SandboxStore,
    private readonly funcs: ReadonlyMap<string, SandboxFunc[]>,
  ) {}

  /**
   * Run one body; `entity` is injected for object functions.
   * @param body - the Func body source.
   * @param entity - optional record injected as `context.entity`.
   * @returns the canonical sandbox result.
   */
  async execute(body: string, entity?: Record<string, unknown>): Promise<ExecResult> {
    try {
      const context = this.buildContext()
      if (entity !== undefined) context.entity = entity
      const result = await new vm.Script(`(async () => {\n${body}\n})()`).runInContext(vm.createContext(context)) as unknown
      if (result === undefined || result === null) return { status: 0, data: {}, msg: null }
      return result as ExecResult
    } catch (error) {
      return { status: 500, data: error instanceof Error ? error.message : String(error), msg: '操作失败' }
    }
  }

  /**
   * Resolve and run a function by schema/identifier (static/object/constructor).
   * @param schemaIdentifier - the entity identifier owning the function.
   * @param funcIdentifier - the function identifier within the entity.
   * @param entityId - the record id for object functions.
   * @returns the canonical sandbox result.
   */
  async call(schemaIdentifier: string, funcIdentifier: string, entityId?: string): Promise<ExecResult> {
    const func = (this.funcs.get(schemaIdentifier) ?? []).find(candidate => candidate.identifier === funcIdentifier)
    if (func === undefined) return { status: 404, data: { schema: schemaIdentifier, identifier: funcIdentifier }, msg: '函数不存在' }
    if (func.type === 'static') return this.execute(func.body)
    if (func.type === 'object') {
      if (entityId === undefined) return { status: 400, data: { schema: schemaIdentifier, identifier: funcIdentifier }, msg: 'ID缺失' }
      const entity = await this.store.findById(schemaIdentifier, entityId)
      if (entity === null) return { status: 404, data: { _id: entityId }, msg: '数据不存在' }
      return this.execute(func.body, entity)
    }
    return { status: 400, data: { schema: schemaIdentifier, identifier: funcIdentifier }, msg: '函数类型不支持' }
  }

  private buildContext(): Record<string, unknown> {
    return {
      console,
      Buffer,
      crypto: { createHash, randomBytes },
      __env: {},
      reportError: () => {},
      reportService: () => {},
      dayjs: (value?: unknown) => {
        /* oxlint-disable-next-line typescript/no-base-to-string -- dayjs shim renders the value as format() text */
        const text = value === undefined ? '' : String(value)
        return {
          format: () => text,
          toDate: () => new Date(text),
        }
      },
      ObjectId: ObjectIdValue,
      Decimal: DecimalValue,
      getColl: (identifier: string) => this.collection(identifier),
      __funcExecutor: (schema: string, func: string, entityId?: string) => this.call(schema, func, entityId),
    }
  }

  private collection(identifier: string): Record<string, unknown> {
    return {
      find: (filter?: Record<string, unknown>) => ({
        toArray: async () => (await this.store.list(identifier)).filter(record => matches(record, filter ?? {})),
      }),
      findOne: async (filter?: Record<string, unknown>) =>
        (await this.store.list(identifier)).find(record => matches(record, filter ?? {})) ?? null,
      updateOne: async (filter: Record<string, unknown>, update: { $set?: Record<string, unknown> }) => {
        const hits = (await this.store.list(identifier)).filter(record => matches(record, filter))
        for (const hit of hits) await this.store.update(identifier, String(hit._id), update.$set ?? {})
        return { modifiedCount: hits.length }
      },
      insertOne: async (document: Record<string, unknown>) => {
        const record = await this.store.insert(identifier, document)
        return { insertedId: record._id }
      },
      deleteOne: async (filter: Record<string, unknown>) => {
        const hits = (await this.store.list(identifier)).filter(record => matches(record, filter))
        for (const hit of hits) await this.store.removeById(identifier, String(hit._id))
        return { deletedCount: hits.length }
      },
      countDocuments: async (filter?: Record<string, unknown>) =>
        (await this.store.list(identifier)).filter(record => matches(record, filter ?? {})).length,
    }
  }
}
