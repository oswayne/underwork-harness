/** Durable entity store over a KV backend, mirroring uicp DataCmdApp semantics. */

import { randomUUID } from 'node:crypto'
import type { KvBackend, SandboxEntity, SandboxField } from './types.ts'

/** Structured sandbox failure with a platform-shaped status code. */
export class SandboxError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message)
  }
}

/**
 * Collection name derivation: `sd_<identifier>` with dashes as underscores.
 * @param identifier - the entity identifier.
 * @returns the sandbox table name.
 */
export function tableName(identifier: string): string {
  return identifier.toLowerCase().replaceAll('-', '_')
}

/** Parse one input value by field type, mirroring `Field.parse`. */
function parseForType(type: string, value: unknown): unknown {
  if (type === '数字') return Number(value)
  if (type === '布尔') return Boolean(value)
  if (type === '日期' || type === '日期时间') {
    const date = new Date(String(value))
    return Number.isNaN(date.getTime()) ? value : date
  }
  if (type === '文本' || type === 'ObjectId') return String(value)
  return value
}

/** CRUD store for one app-package's entities. */
export class SandboxStore {
  constructor(
    private readonly backend: KvBackend,
    private readonly entities: ReadonlyMap<string, SandboxEntity>,
  ) {}

  private fields(identifier: string): SandboxField[] {
    return this.entities.get(identifier)?.fields ?? []
  }

  private async rows(identifier: string): Promise<Record<string, unknown>[]> {
    const snapshot = await this.backend.loadAll()
    return Object.values(snapshot.tables[tableName(identifier)] ?? {}) as Record<string, unknown>[]
  }

  private async put(identifier: string, record: Record<string, unknown>): Promise<void> {
    await this.backend.putRecord(tableName(identifier), String(record._id), record)
  }

  /**
   * All records of one entity.
   * @param identifier - the entity identifier.
   * @returns every stored record.
   */
  async list(identifier: string): Promise<Record<string, unknown>[]> {
    return this.rows(identifier)
  }

  /**
   * One record by id, or null.
   * @param identifier - the entity identifier.
   * @param id - the record id.
   * @returns the matching record or null.
   */
  async findById(identifier: string, id: unknown): Promise<Record<string, unknown> | null> {
    const target = String(id)
    return (await this.rows(identifier)).find(record => String(record._id) === target) ?? null
  }

  /**
   * Insert one record with unique checks, defaults, and tree data.
   * @param identifier - the entity identifier.
   * @param input - the record fields to insert.
   * @returns the stored record with generated metadata.
   */
  async insert(identifier: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const existing = await this.rows(identifier)
    for (const field of this.fields(identifier)) {
      if (field.unique && input[field.name] !== undefined
        && existing.some(record => String(record[field.name]) === String(input[field.name]))) {
        throw new SandboxError(400, `此${field.name}已存在`)
      }
    }
    const record: Record<string, unknown> = {
      ...input,
      _id: typeof input._id === 'string' ? input._id : randomUUID(),
      creator: 'sandbox',
      modifier: 'sandbox',
      createTime: new Date().toISOString(),
      modifyTime: new Date().toISOString(),
    }
    for (const field of this.fields(identifier)) {
      if (record[field.name] !== undefined) record[field.name] = parseForType(field.type, record[field.name])
    }
    if (this.entities.get(identifier)?.tree) {
      this.applyTreeData(record, await this.findById(identifier, input.parent))
    }
    await this.put(identifier, record)
    return record
  }

  /**
   * Batch insert; no constructor semantics (mirrors `insertBatch`).
   * @param identifier - the entity identifier.
   * @param records - the records to insert.
   * @returns the stored records.
   */
  async insertBatch(identifier: string, records: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
    const inserted: Record<string, unknown>[] = []
    for (const record of records) inserted.push(await this.insert(identifier, record))
    return inserted
  }

  /**
   * Merge a patch into one record, refreshing `modifyTime`.
   * @param identifier - the entity identifier.
   * @param id - the record id.
   * @param patch - the fields to merge.
   * @returns the updated record.
   */
  async update(identifier: string, id: unknown, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    const record = await this.findById(identifier, id)
    if (record === null) throw new SandboxError(404, '数据不存在')
    const next: Record<string, unknown> = { ...record, ...patch, _id: record._id, modifyTime: new Date().toISOString() }
    await this.put(identifier, next)
    return next
  }

  /**
   * Delete one record; returns the removed record or null.
   * @param identifier - the entity identifier.
   * @param id - the record id.
   * @returns the removed record or null when absent.
   */
  async removeById(identifier: string, id: unknown): Promise<Record<string, unknown> | null> {
    const record = await this.findById(identifier, id)
    if (record !== null) await this.backend.deleteRecord(tableName(identifier), String(id))
    return record
  }

  /**
   * Delete many records; returns the number removed.
   * @param identifier - the entity identifier.
   * @param ids - the record ids to remove.
   * @returns the number actually removed.
   */
  async removeMany(identifier: string, ids: unknown[]): Promise<number> {
    let removed = 0
    for (const id of ids) {
      if (await this.removeById(identifier, id) !== null) removed += 1
    }
    return removed
  }

  private applyTreeData(record: Record<string, unknown>, parent: Record<string, unknown> | null): void {
    if (parent !== null) {
      record.parent = parent._id
      record.path = `${String(parent.path)}/${String(record._id)}`
      record.level = Number(parent.level) + 1
    } else {
      record.parent = null
      record.path = `/${String(record._id)}`
      record.level = 1
    }
  }
}
