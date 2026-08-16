/**
 * Pure static validation for one app-package directory (contract in
 * app-packages/README.md). The tool layer collects file contents and this
 * module decides issues and cross-app dependencies from them.
 * @module
 */

import vm from 'node:vm'
import Ajv, { type ValidateFunction } from 'ajv'

/** Platform `Field.type` enum (uicp-server `apppackage/field/domain/Field.js`). */
export const FIELD_TYPES = ['文本', 'ObjectId', '数字', '对象', '日期', '日期时间', '布尔'] as const

/** Platform `Func.type` enum (static / object / constructor). */
export const FUNC_TYPES = ['static', 'object', 'constructor'] as const

/** Vocabulary the platform sandbox does not provide; presence marks "manual handling required". */
export const EXTERNAL_VOCAB = ['axios', 'ai', 'requireAdapter'] as const

const IDENTIFIER_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ENTITY_URL_RE = /\/app-package\/entity\/([a-z0-9-]+)/g
const GET_COLL_RE = /getColl\s*\(\s*['"]([a-z0-9-]+)['"]/g
const EXEC_FUNC_RE = /__funcExecutor\s*\(\s*['"]([a-z0-9-]+)['"]/g

/** One structured validation finding. */
export interface Issue {
  severity: 'error' | 'warning'
  file: string
  rule: string
  message: string
}

/** One cross-app reference extracted from page JSON or Func bodies. */
export interface Dependency {
  identifier: string
  kind: 'data' | 'func'
  references: string[]
}

/** Validation outcome: issues plus derived cross-app dependencies. */
export interface ValidationResult {
  issues: Issue[]
  dependencies: Dependency[]
}

/** Directory names the package sits under, used for tenant/app consistency. */
export interface PackageContext {
  tenantDirName: string
  appDirName: string
}

let validator: ValidateFunction | undefined

function eurekaValidator(schemaText: string): ValidateFunction {
  if (validator === undefined) {
    validator = new Ajv({ strict: false, allErrors: true }).compile(JSON.parse(schemaText) as object)
  }
  return validator
}

function issue(severity: Issue['severity'], file: string, rule: string, message: string): Issue {
  return { severity, file, rule, message }
}

function parseObject(content: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(content) as unknown
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    return value as Record<string, unknown>
  } catch {
    return undefined
  }
}

/**
 * Validate one app-package directory. `files` maps relative paths to contents;
 * missing required files surface as `package.missing` errors.
 * @param files - relative path to UTF-8 content for every collected file.
 * @param ctx - directory names used for tenant/app consistency checks.
 * @param eurekaSchemaText - Eureka `schema.json` text for page validation.
 * @returns issues (errors fail publication, warnings need review) and dependencies.
 */
export function validatePackage(
  files: Record<string, string>,
  ctx: PackageContext,
  eurekaSchemaText: string,
): ValidationResult {
  const issues: Issue[] = []
  const ownIdentifiers = new Set<string>()
  const entityFields = new Map<string, { names: string[]; types: Map<string, string> }>()
  const pageContents = new Map<string, string>()
  const depMap = new Map<string, { kind: Dependency['kind']; refs: Set<string> }>()

  const addDep = (identifier: string, kind: Dependency['kind'], reference: string): void => {
    if (ownIdentifiers.has(identifier)) return
    const existing = depMap.get(identifier)
    if (existing === undefined) {
      depMap.set(identifier, { kind, refs: new Set([reference]) })
    } else {
      existing.refs.add(reference)
    }
  }

  const appContent = files['app.json']
  if (appContent === undefined) {
    issues.push(issue('error', 'app.json', 'package.missing', '缺少 app.json'))
  } else {
    const app = parseObject(appContent)
    if (app === undefined) {
      issues.push(issue('error', 'app.json', 'json.invalid', 'app.json 不是合法 JSON 对象'))
    } else {
      if (app.identifier !== ctx.appDirName) {
        issues.push(issue('error', 'app.json', 'package.identifier', `app.identifier=${String(app.identifier)} 与目录名 ${ctx.appDirName} 不一致`))
      }
      if (typeof app.name !== 'string' || app.name.length === 0) {
        issues.push(issue('error', 'app.json', 'package.name', 'app.name 必须是非空字符串'))
      }
    }
  }

  const tenantContent = files['tenant.json']
  if (tenantContent === undefined) {
    issues.push(issue('error', 'tenant.json', 'package.missing', '缺少 tenant.json'))
  } else {
    const tenant = parseObject(tenantContent)
    if (tenant === undefined) {
      issues.push(issue('error', 'tenant.json', 'json.invalid', 'tenant.json 不是合法 JSON 对象'))
    } else if (tenant.identifier !== ctx.tenantDirName) {
      issues.push(issue('error', 'tenant.json', 'package.tenant', `tenant.identifier=${String(tenant.identifier)} 与目录名 ${ctx.tenantDirName} 不一致`))
    }
  }

  const entityPaths = Object.keys(files).filter(path => path.startsWith('entities/') && path.endsWith('.json')).sort()
  for (const path of entityPaths) {
    const identifier = path.slice('entities/'.length, -'.json'.length)
    if (!IDENTIFIER_RE.test(identifier)) {
      issues.push(issue('error', path, 'entity.identifier', `identifier 非法（应为小写 kebab-case）: ${identifier}`))
    }
    const entity = parseObject(files[path] as string)
    if (entity === undefined) {
      issues.push(issue('error', path, 'json.invalid', 'Entity 文件不是合法 JSON 对象'))
      continue
    }
    if (entity.identifier !== identifier) {
      issues.push(issue('error', path, 'entity.identifier', `entity.identifier=${String(entity.identifier)} 与文件名不一致`))
    }
    if (typeof entity.identifier === 'string') {
      if (ownIdentifiers.has(entity.identifier)) {
        issues.push(issue('error', path, 'entity.duplicate', `identifier 重复: ${entity.identifier}`))
      }
      ownIdentifiers.add(entity.identifier)
    }
    if (!Array.isArray(entity.fields)) {
      issues.push(issue('error', path, 'entity.fields', 'fields 必须是数组'))
      continue
    }
    const names = new Set<string>()
    const fieldNames: string[] = []
    const fieldTypes = new Map<string, string>()
    for (const field of entity.fields) {
      if (typeof field !== 'object' || field === null) {
        issues.push(issue('error', path, 'entity.field', '字段必须是对象'))
        continue
      }
      const name = (field as Record<string, unknown>).name
      if (typeof name !== 'string' || name.length === 0) {
        issues.push(issue('error', path, 'entity.field', '字段 name 必须是非空字符串'))
        continue
      }
      if (names.has(name)) {
        issues.push(issue('error', path, 'entity.field', `字段名重复: ${name}`))
      }
      names.add(name)
      const label = (field as Record<string, unknown>).label
      if (typeof label !== 'string' || label.length === 0) {
        issues.push(issue('error', path, 'entity.field', `字段 ${name} 缺少 label`))
      }
      const type = (field as Record<string, unknown>).type
      if (typeof type !== 'string' || !(FIELD_TYPES as readonly string[]).includes(type)) {
        issues.push(issue('error', path, 'entity.field', `字段 ${name} type 非法: ${String(type)}`))
      }
      const unique = (field as Record<string, unknown>).unique
      if (unique !== undefined && typeof unique !== 'boolean') {
        issues.push(issue('error', path, 'entity.field', `字段 ${name} unique 必须是布尔`))
      }
      const editable = (field as Record<string, unknown>).editable
      if (editable !== undefined && typeof editable !== 'boolean') {
        issues.push(issue('error', path, 'entity.field', `字段 ${name} editable 必须是布尔`))
      }
      fieldNames.push(name)
      if (typeof type === 'string') fieldTypes.set(name, type)
    }
    entityFields.set(identifier, { names: fieldNames, types: fieldTypes })
  }

  const funcPaths = Object.keys(files).filter(path => /^funcs\/[^/]+\/[^/]+\.js$/.test(path)).sort()
  for (const path of funcPaths) {
    const parts = path.slice('funcs/'.length).split('/') as [string, string]
    const entityDir = parts[0]
    const funcId = parts[1].slice(0, -'.js'.length)
    const metaPath = `funcs/${entityDir}/${funcId}.meta.json`
    const metaContent = files[metaPath]
    if (metaContent === undefined) {
      issues.push(issue('error', path, 'func.meta', `缺少元信息文件 ${metaPath}`))
      continue
    }
    const meta = parseObject(metaContent)
    if (meta === undefined) {
      issues.push(issue('error', metaPath, 'json.invalid', '函数元信息不是合法 JSON 对象'))
      continue
    }
    if (meta.identifier !== funcId) {
      issues.push(issue('error', metaPath, 'func.identifier', `func.identifier=${String(meta.identifier)} 与文件名不一致`))
    }
    if (typeof meta.type !== 'string' || !(FUNC_TYPES as readonly string[]).includes(meta.type)) {
      issues.push(issue('error', metaPath, 'func.type', `type 非法: ${String(meta.type)}`))
    }
    const body = files[path] as string
    try {
      new vm.Script(`(async () => {\n${body}\n})()`)
    } catch {
      issues.push(issue('error', path, 'func.syntax', 'Func body 无法编译'))
    }
    for (const external of EXTERNAL_VOCAB) {
      if (new RegExp(`\\b${external}\\b`).test(body)) {
        issues.push(issue('warning', path, 'func.external', `使用外部依赖词汇 ${external}，标记"依赖人工处理"`))
        break
      }
    }
    for (const match of body.matchAll(GET_COLL_RE)) addDep(match[1] as string, 'data', path)
    for (const match of body.matchAll(EXEC_FUNC_RE)) addDep(match[1] as string, 'func', path)
  }

  const pagePaths = Object.keys(files).filter(path => path.startsWith('pages/') && path.endsWith('.json')).sort()
  const validate = eurekaValidator(eurekaSchemaText)
  for (const path of pagePaths) {
    const identifier = path.slice('pages/'.length, -'.json'.length)
    const content = files[path] as string
    pageContents.set(identifier, content)
    let page: unknown
    try {
      page = JSON.parse(content)
    } catch {
      issues.push(issue('error', path, 'json.invalid', '页面 JSON 无法解析'))
      continue
    }
    if (typeof page !== 'object' || page === null || (page as Record<string, unknown>).type !== 'page') {
      issues.push(issue('error', path, 'page.type', '页面顶层 type 必须为 "page"'))
      continue
    }
    if (!validate(page)) {
      const first = validate.errors?.[0]
      /* v8 ignore next -- Ajv allErrors always reports at least one error; fallbacks guard impossible states */
      issues.push(issue('error', path, 'page.schema', `Eureka schema 校验失败: ${first === undefined ? '未知错误' : `${first.instancePath || '/'} ${first.message}`}`))
    }
    for (const match of content.matchAll(ENTITY_URL_RE)) addDep(match[1] as string, 'data', path)
  }

  const menuContent = files['menus.json']
  if (menuContent === undefined) {
    issues.push(issue('error', 'menus.json', 'package.missing', '缺少 menus.json'))
  } else {
    let menus: unknown
    try {
      menus = JSON.parse(menuContent)
    } catch {
      menus = undefined
    }
    if (!Array.isArray(menus)) {
      issues.push(issue('error', 'menus.json', 'menu.structure', 'menus.json 必须是数组'))
    } else {
      for (const menu of menus) {
        if (typeof menu !== 'object' || menu === null) {
          issues.push(issue('error', 'menus.json', 'menu.structure', '菜单项必须是对象'))
          continue
        }
        const name = (menu as Record<string, unknown>).name
        if (typeof name !== 'string' || name.length === 0) {
          issues.push(issue('error', 'menus.json', 'menu.name', '菜单 name 必须是非空字符串'))
        }
        const page = (menu as Record<string, unknown>).page
        if (page !== undefined) {
          if (typeof page !== 'string') {
            issues.push(issue('error', 'menus.json', 'menu.page', 'page 挂载必须是字符串'))
          } else if (!pageContents.has(page)) {
            issues.push(issue('error', 'menus.json', 'menu.mount', `挂载的页面不存在: ${page}`))
          }
        }
      }
    }
  }

  const dataPaths = Object.keys(files).filter(path => path.startsWith('data/') && path.endsWith('.json')).sort()
  for (const path of dataPaths) {
    const entityId = path.slice('data/'.length, -'.json'.length)
    const entityFieldInfo = entityFields.get(entityId)
    if (entityFieldInfo === undefined) {
      issues.push(issue('error', path, 'data.entity', `fixture 对应的 Entity 不存在: ${entityId}`))
      continue
    }
    let records: unknown
    try {
      records = JSON.parse(files[path] as string)
    } catch {
      issues.push(issue('error', path, 'json.invalid', 'fixture JSON 无法解析'))
      continue
    }
    if (!Array.isArray(records)) {
      issues.push(issue('error', path, 'data.structure', 'fixture 必须是记录数组'))
      continue
    }
    const fieldSet = new Set(entityFieldInfo.names)
    for (const record of records) {
      if (typeof record !== 'object' || record === null || Array.isArray(record)) {
        issues.push(issue('error', path, 'data.record', '记录必须是对象'))
        continue
      }
      const entries = record as Record<string, unknown>
      for (const key of Object.keys(entries)) {
        if (!fieldSet.has(key)) issues.push(issue('error', path, 'data.field', `记录字段 ${key} 不在 Entity 字段中`))
      }
      for (const [name, type] of entityFieldInfo.types) {
        const value = entries[name]
        if (value === undefined) continue
        if (type === '数字' && typeof value !== 'number') {
          issues.push(issue('error', path, 'data.type', `字段 ${name} 应为数字`))
        }
        if (type === '布尔' && typeof value !== 'boolean') {
          issues.push(issue('error', path, 'data.type', `字段 ${name} 应为布尔`))
        }
        if ((type === '文本' || type === 'ObjectId' || type === '日期' || type === '日期时间') && typeof value !== 'string') {
          issues.push(issue('error', path, 'data.type', `字段 ${name} 应为字符串`))
        }
      }
    }
  }

  if (entityPaths.length === 0) issues.push(issue('warning', 'entities/', 'package.empty', '没有 Entity'))
  if (funcPaths.length === 0) issues.push(issue('warning', 'funcs/', 'package.empty', '没有函数'))
  if (pagePaths.length === 0) issues.push(issue('warning', 'pages/', 'package.empty', '没有页面'))

  const dependencies: Dependency[] = [...depMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([identifier, dep]) => ({ identifier, kind: dep.kind, references: [...dep.refs].sort() }))
  return { issues, dependencies }
}
