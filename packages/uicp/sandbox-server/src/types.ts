/** Shared sandbox contracts; runtime values mirror the uicp platform records. */

/** One Entity field (platform `Field` record projection). */
export interface SandboxField {
  name: string
  label?: string
  type: string
  unique?: boolean
  editable?: boolean
}

/** One Entity (platform `Schema` record projection). */
export interface SandboxEntity {
  name: string
  identifier: string
  tree?: boolean
  fields: SandboxField[]
}

/** One Function (platform `Func` record projection). */
export interface SandboxFunc {
  identifier: string
  name: string
  type: 'static' | 'object' | 'constructor'
  comment?: string
  body: string
}

/** Normalized request the router dispatches on. */
export interface SandboxRequest {
  method: string
  /** Path below `/app-package/entity` (no leading slash). */
  path: string
  query: Record<string, string | string[] | undefined>
  body: unknown
  session: string
}

/** HTTP-level response the sandbox produces. */
export interface SandboxResponse {
  statusCode: number
  body: { status: number; msg: string; data: unknown }
}

/** Durable KV surface the store persists through (ctx.storage KvUnit shape). */
export interface KvBackend {
  loadAll(): Promise<{ tables: Record<string, Record<string, unknown>>; global: unknown }>
  putRecord(table: string, key: string, value: unknown): Promise<void>
  deleteRecord(table: string, key: string): Promise<void>
}
