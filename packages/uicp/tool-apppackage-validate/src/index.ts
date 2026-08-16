/**
 * Model-facing app-package static validation tool for the UICP low-code
 * driver. Reads one app-package directory through `ctx.fs`, validates it
 * against the app-package contract, and returns structured issues plus
 * derived cross-app dependencies.
 * @module @deepseek-ai/dsh-tool-apppackage-validate
 */

import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs'
import { validatePackage, type Dependency, type Issue } from './validate.ts'

export const name = 'tool-apppackage-validate'
export const inject = ['fs', 'tools']

const EUREKA_SCHEMA_URL = new URL('../data/eureka-schema.json', import.meta.url)

let schemaTextCache: string | undefined

async function loadEurekaSchemaText(): Promise<string> {
  if (schemaTextCache === undefined) {
    schemaTextCache = await readFile(EUREKA_SCHEMA_URL, 'utf8')
  }
  return schemaTextCache
}

/** Canonical tool value: pass/fail plus structured findings. */
export interface AppPackageResult {
  ok: boolean
  issues: Issue[]
  dependencies: Dependency[]
}

/** Pure terminal presentation of the canonical result. */
export function renderResult(value: AppPackageResult): { type: 'text'; text: string }[] {
  const lines = [`apppackage_validate: ${value.ok ? 'OK' : 'FAIL'}`]
  if (value.issues.length > 0) {
    lines.push(`${value.issues.length} issue(s):`)
    for (const item of value.issues) lines.push(`  [${item.severity}] ${item.file} (${item.rule}) ${item.message}`)
  }
  if (value.dependencies.length > 0) {
    lines.push(`${value.dependencies.length} cross-app reference(s):`)
    for (const dep of value.dependencies) lines.push(`  ${dep.identifier} (${dep.kind}): ${dep.references.join(', ')}`)
  }
  return [{ type: 'text', text: lines.join('\n') }]
}

/**
 * Collect the contract-relevant files of an app-package directory into a
 * relative-path → content map, walking `entities/`, `pages/`, `data/`, and
 * the two-level `funcs/<entity>/` tree.
 */
export async function collectFiles(
  fs: FileSystem,
  root: FsTarget,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  const entries = await fs.listDir(root, signal)
  const byName = new Map(entries.map(entry => [entry.name, entry]))
  const readNamed = async (name: string): Promise<void> => {
    const entry = byName.get(name)
    if (entry !== undefined && entry.type === 'file') {
      files[name] = await fs.readText(entry.target, signal)
    }
  }
  await readNamed('app.json')
  await readNamed('tenant.json')
  await readNamed('menus.json')
  for (const dir of ['entities', 'pages', 'data'] as const) {
    const entry = byName.get(dir)
    if (entry !== undefined && entry.type === 'directory') {
      for (const child of await fs.listDir(entry.target, signal)) {
        if (child.type === 'file' && child.name.endsWith('.json')) {
          files[`${dir}/${child.name}`] = await fs.readText(child.target, signal)
        }
      }
    }
  }
  const funcsEntry = byName.get('funcs')
  if (funcsEntry !== undefined && funcsEntry.type === 'directory') {
    for (const entity of await fs.listDir(funcsEntry.target, signal)) {
      if (entity.type !== 'directory') continue
      for (const child of await fs.listDir(entity.target, signal)) {
        if (child.type === 'file' && (child.name.endsWith('.js') || child.name.endsWith('.meta.json'))) {
          files[`funcs/${entity.name}/${child.name}`] = await fs.readText(child.target, signal)
        }
      }
    }
  }
  return files
}

/**
 * Register the `apppackage_validate` tool. Reads are routed through `ctx.fs`
 * so sandbox policy applies; the tool is read-only and safe to run in parallel.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'apppackage_validate',
    description: 'Validate an app-package directory against the app-package contract (app-packages/README.md) and report structured issues plus cross-app dependencies. Run it after generating or editing an app package, before adoption or publish.',
    parameters: {
      directory: {
        type: 'string',
        required: true,
        description: 'Absolute path of the app-package directory, e.g. app-packages/<tenant>/<app>.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          issues: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                severity: { type: 'string', required: true, enum: ['error', 'warning'] },
                file: { type: 'string', required: true },
                rule: { type: 'string', required: true },
                message: { type: 'string', required: true },
              },
            },
          },
          dependencies: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                identifier: { type: 'string', required: true },
                kind: { type: 'string', required: true, enum: ['data', 'func'] },
                references: { type: 'array', required: true, items: { type: 'string' } },
              },
            },
          },
        },
      },
      render: (_args, value) => renderResult(value),
    },
    async execute(args) {
      const root = await ctx.fs.resolve(args.directory)
      const files = await collectFiles(ctx.fs, root)
      const normalized = args.directory.replace(/\/+$/, '')
      const slash = normalized.lastIndexOf('/')
      const appDirName = normalized.slice(slash + 1)
      const tenantPart = normalized.slice(0, slash)
      const tenantDirName = tenantPart.slice(tenantPart.lastIndexOf('/') + 1)
      const result = validatePackage(files, { tenantDirName, appDirName }, await loadEurekaSchemaText())
      return {
        ok: result.issues.every(item => item.severity !== 'error'),
        issues: result.issues,
        dependencies: result.dependencies,
      }
    },
  }))
}
