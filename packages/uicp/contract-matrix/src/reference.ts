/** Build the deterministic local sandbox used as the matrix reference target. */

import {
  MemoryKvBackend, SandboxExecutor, SandboxRouter, SandboxStore,
} from '@deepseek-ai/dsh-sandbox-server'
import type { SandboxEntity, SandboxFunc, SandboxRequest, SandboxResponse } from '@deepseek-ai/dsh-sandbox-server/src/types.ts'
import type { MatrixRequest, MatrixResponse } from './runner.ts'

const MATRIX_ENTITY: SandboxEntity = {
  name: '矩阵',
  identifier: 'matrix',
  fields: [
    { name: 'name', label: '名称', type: '文本', unique: true },
    { name: 'amount', label: '金额', type: '数字' },
    { name: 'active', label: '启用', type: '布尔' },
    { name: 'date', label: '日期', type: '日期' },
  ],
}

const TREE_ENTITY: SandboxEntity = { name: '矩阵树', identifier: 'matrix-tree', tree: true, fields: [{ name: 'title', label: '标题', type: '文本' }] }

const FUNCS: SandboxFunc[] = [
  {
    identifier: 'defaultAmount',
    name: '默认金额',
    type: 'constructor',
    body: "entity.amount = entity.amount ?? 0\nif (entity.name === 'BAD') return { status: 400, data: null, msg: 'bad' }\nreturn { status: 0, data: entity, msg: 'ok' }",
  },
  { identifier: 'staticOk', name: '静态', type: 'static', body: 'return { status: 0, data: { ok: true }, msg: "ok" }' },
  { identifier: 'objectOk', name: '对象', type: 'object', body: 'return { status: 0, data: entity, msg: "ok" }' },
]

/**
 * Build a fresh in-process sandbox seeded with the canonical matrix records.
 * @returns the sandbox adapter plus id lookup helpers.
 */
export function buildReferenceTarget(): {
  target: (request: MatrixRequest) => Promise<MatrixResponse>
  seed: () => Promise<void>
  resolve: (path: string) => string
  state: { matrixIds: string[]; treeRootId: string }
} {
  const entities = new Map<string, SandboxEntity>([
    [MATRIX_ENTITY.identifier, MATRIX_ENTITY],
    [TREE_ENTITY.identifier, TREE_ENTITY],
  ])
  const funcs = new Map<string, SandboxFunc[]>([
    [MATRIX_ENTITY.identifier, FUNCS],
  ])
  const store = new SandboxStore(new MemoryKvBackend(), entities)
  const executor = new SandboxExecutor(store, funcs)
  const router = new SandboxRouter({ store, executor, entities, funcs })
  const state = { matrixIds: [] as string[], treeRootId: '' }

  const target = async (request: MatrixRequest): Promise<MatrixResponse> => {
    const sandboxRequest: SandboxRequest = {
      method: request.method,
      path: request.path,
      query: request.query,
      body: request.body,
      session: 'matrix',
    }
    const response: SandboxResponse = await router.handle(sandboxRequest)
    return response
  }

  const seed = async (): Promise<void> => {
    for (const record of [
      { _id: 'seed-1', name: 'Alpha', amount: 10, active: true, date: '2026-01-01' },
      { _id: 'seed-2', name: 'Beta', amount: 20, active: false, date: '2026-02-01' },
      { _id: 'seed-3', name: 'Gamma', amount: 30, active: true, date: '2026-03-01' },
    ]) {
      const inserted = await store.insert(MATRIX_ENTITY.identifier, record)
      state.matrixIds.push(String(inserted._id))
    }
    const root = await store.insert(TREE_ENTITY.identifier, { _id: 'tree-1', title: '根' })
    state.treeRootId = String(root._id)
    await store.insert(TREE_ENTITY.identifier, { _id: 'tree-2', title: '子', parent: root._id })
  }

  const resolve = (path: string): string => path

  return { target, seed, resolve, state }
}
