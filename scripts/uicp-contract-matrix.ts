/**
 * Run the uicp behavior matrix against the local sandbox reference and, when
 * platform credentials are present, diff it against the real platform.
 *
 * Usage:
 *   pnpm exec tsx scripts/uicp-contract-matrix.ts
 *   BASE_URL=... JWT=... TENANT_ID=... pnpm exec tsx scripts/uicp-contract-matrix.ts
 *
 * The platform mode provisions the matrix entities/functions/records under the
 * `dsh-test` app in the given tenant (idempotent) and exits non-zero on any
 * sandbox-platform divergence.
 * @module
 */

import { buildMatrix } from '../packages/uicp/contract-matrix/src/matrix.ts'
import { buildReferenceTarget } from '../packages/uicp/contract-matrix/src/reference.ts'
import { diffMatrix, runMatrix, type MatrixRequest, type MatrixResponse } from '../packages/uicp/contract-matrix/src/runner.ts'

interface PlatformEnv {
  baseUrl: string
  token: string
  tenantId: string
}

async function platformRequest(
  env: PlatformEnv,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ statusCode: number; body: { status?: number; msg: string; data: unknown } }> {
  const response = await fetch(`${env.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: env.token,
      Tenant: env.tenantId,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let json: { status?: number; msg: string; data: unknown }
  try {
    json = JSON.parse(text) as { status: number; msg: string; data: unknown }
  } catch {
    // Record non-JSON failures (e.g. gateway/HTML error pages) as platform-side
    // divergences instead of crashing the diff.
    json = { status: response.status, msg: `平台返回非 JSON（HTTP ${response.status}）`, data: { raw: text.slice(0, 120) } }
  }
  return { statusCode: response.status, body: json }
}

interface PlatformTarget {
  target: (request: MatrixRequest) => Promise<MatrixResponse>
  resolve: (path: string) => string
}

const MATRIX_FUNCS = [
  {
    identifier: 'defaultAmount',
    name: '默认金额',
    type: 'constructor',
    body: "entity.amount = entity.amount ?? 0\nif (entity.name === 'BAD') return { status: 400, data: null, msg: 'bad' }\nreturn { status: 0, data: entity, msg: 'ok' }",
  },
  { identifier: 'staticOk', name: '静态', type: 'static', body: 'return { status: 0, data: { ok: true }, msg: "ok" }' },
  { identifier: 'objectOk', name: '对象', type: 'object', body: 'return { status: 0, data: entity, msg: "ok" }' },
] as const

/** Delete every record of the given entities so each platform run starts clean. */
async function resetRecords(env: PlatformEnv, identifiers: string[]): Promise<void> {
  for (const identifier of identifiers) {
    const rows = (await platformRequest(env, 'GET', `/app-package/entity/${identifier}/list`)).body.data as Array<{ _id: string }>
    for (const row of rows) {
      await platformRequest(env, 'DELETE', `/app-package/entity/${identifier}/${row._id}`)
    }
  }
}

/** Provision matrix entities/functions/records under the `dsh-test` app and return an HTTP target. */
async function buildPlatformTarget(env: PlatformEnv, appIdentifier = 'dsh-test'): Promise<PlatformTarget> {
  const apps = (await platformRequest(env, 'GET', '/app-package/list')).body.data as Array<{ _id: string; identifier?: string }>
  const appId = apps.find(app => app.identifier === appIdentifier)?._id
  if (appId === undefined) throw new Error(`应用包 ${appIdentifier} 不存在，请先导入示例包`)

  const ensureEntity = async (identifier: string, name: string, fields: Array<Record<string, unknown>>, tree = false): Promise<string> => {
    const entities = (await platformRequest(env, 'GET', `/app-package/entity/list?app=${appId}`)).body.data as Array<{ _id: string; identifier?: string }>
    let entityId = entities.find(entity => entity.identifier === identifier)?._id
    if (entityId === undefined) {
      const created = await platformRequest(env, 'POST', '/app-package/entity', { name, identifier, app: appId, tree, version: '1.0.0' })
      entityId = (created.body.data as { _id: string })._id
    }
    const existingFields = (await platformRequest(env, 'GET', `/app-package/entity/field/list?entity=${entityId}`)).body.data as Array<{ name: string }>
    for (const field of fields) {
      if (!existingFields.some(existing => existing.name === field.name)) {
        await platformRequest(env, 'POST', '/app-package/entity/field', { ...field, entity: entityId })
      }
    }
    return entityId
  }

  const matrixEntity = await ensureEntity('matrix', '矩阵', [
    { name: 'name', label: '名称', type: '文本', unique: true },
    { name: 'amount', label: '金额', type: '数字' },
    { name: 'active', label: '启用', type: '布尔' },
    { name: 'date', label: '日期', type: '日期' },
  ])
  await ensureEntity('matrix-tree', '矩阵树', [{ name: 'title', label: '标题', type: '文本' }], true)

  const existingFuncs = (await platformRequest(env, 'GET', `/app-package/entity/func/list?entity=${matrixEntity}`)).body.data as Array<{ identifier: string }>
  for (const func of MATRIX_FUNCS) {
    if (!existingFuncs.some(existing => existing.identifier === func.identifier)) {
      await platformRequest(env, 'POST', '/app-package/entity/func', { ...func, entity: matrixEntity })
    }
  }

  const ids: Record<string, string> = {}
  const matrixRows = (await platformRequest(env, 'GET', '/app-package/entity/matrix/list')).body.data as Array<{ _id: string; name: string }>
  for (const [name, amount, active, date] of [
    ['Alpha', 10, true, '2026-01-01'],
    ['Beta', 20, false, '2026-02-01'],
    ['Gamma', 30, true, '2026-03-01'],
  ] as const) {
    const existing = matrixRows.find(row => row.name === name)
    if (existing !== undefined) {
      ids[name] = existing._id
    } else {
      const created = await platformRequest(env, 'POST', '/app-package/entity/matrix', { name, amount, active, date })
      ids[name] = String(created.body.data)
    }
  }
  const treeRows = (await platformRequest(env, 'GET', '/app-package/entity/matrix-tree/list')).body.data as Array<{ _id: string; title: string; parent?: unknown }>
  let root = treeRows.find(row => row.title === '根' && row.parent === undefined)
  if (root === undefined) {
    const created = await platformRequest(env, 'POST', '/app-package/entity/matrix-tree', { title: '根' })
    root = { _id: String(created.body.data), title: '根' }
  }
  ids['tree-1'] = root._id
  if (!treeRows.some(row => row.title === '子')) {
    await platformRequest(env, 'POST', '/app-package/entity/matrix-tree', { title: '子', parent: root._id })
  }

  const target = async (request: MatrixRequest): Promise<MatrixResponse> => {
    const query = new URLSearchParams(request.query).toString()
    const path = query === '' ? `/app-package/entity${request.path}` : `/app-package/entity${request.path}?${query}`
    return platformRequest(env, request.method, path, request.body)
  }
  const resolve = (path: string): string => path
    .replaceAll('seed-1', ids.Alpha ?? 'missing')
    .replaceAll('seed-2', ids.Beta ?? 'missing')
    .replaceAll('seed-3', ids.Gamma ?? 'missing')
    .replaceAll('tree-1', ids['tree-1'] ?? 'missing')
  return { target, resolve }
}

async function main(): Promise<void> {
  const matrix = buildMatrix()
  const reference = buildReferenceTarget()
  await reference.seed()
  const localResults = await runMatrix(reference.target, matrix, reference.resolve)
  const localFailed = localResults.filter(result => !result.passed)
  console.log(`local sandbox: ${localResults.length - localFailed.length}/${localResults.length}`)
  for (const failure of localFailed) console.log(`  [FAIL] ${failure.name}: ${failure.message}`)

  const baseUrl = process.env.BASE_URL
  const token = process.env.JWT
  const tenantId = process.env.TENANT_ID
  if (baseUrl === undefined || token === undefined || tenantId === undefined) {
    console.log('未提供平台凭据，跳过平台比对')
    process.exitCode = localFailed.length === 0 ? 0 : 1
    return
  }

  await resetRecords({ baseUrl, token, tenantId }, ['matrix', 'matrix-tree'])
  const platform = await buildPlatformTarget({ baseUrl, token, tenantId })
  const platformReference = buildReferenceTarget()
  await platformReference.seed()
  const divergences = await diffMatrix(platformReference.target, platform.target, matrix, path => path, platform.resolve)
  console.log(`sandbox vs platform: ${matrix.length - divergences.length}/${matrix.length} 一致`)
  for (const divergence of divergences) {
    console.log(`  [DIFF] ${divergence.name}`)
    console.log(`    sandbox: ${divergence.left.message}`)
    console.log(`    platform: ${divergence.right.message}`)
  }
  process.exitCode = divergences.length === 0 && localFailed.length === 0 ? 0 : 1
}

void main()
