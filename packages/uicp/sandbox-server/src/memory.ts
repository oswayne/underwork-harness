/** In-memory KV backend for keyless tests and tool execution. */

import type { KvBackend } from './types.ts'

/** Volatile KV surface; usable wherever a durable backend is not required. */
export class MemoryKvBackend implements KvBackend {
  readonly tables: Record<string, Record<string, unknown>> = {}

  loadAll(): Promise<{ tables: Record<string, Record<string, unknown>>; global: unknown }> {
    return Promise.resolve({ tables: this.tables, global: null })
  }

  putRecord(table: string, key: string, value: unknown): Promise<void> {
    this.tables[table] ??= {}
    this.tables[table][key] = value
    return Promise.resolve()
  }

  deleteRecord(table: string, key: string): Promise<void> {
    delete this.tables[table]?.[key]
    return Promise.resolve()
  }
}
