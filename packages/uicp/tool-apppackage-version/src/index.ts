/**
 * Model-facing local version management for UICP app packages: snapshot,
 * list, and restore product files under `versions/`.
 * @module @deepseek-ai/dsh-tool-apppackage-version
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-apppackage-version'
export const inject = ['fs', 'tools']

const EXCLUDED_TOP_LEVEL = new Set(['tests', 'versions'])

/**
 * Recursively collect product files (excluding tests/, versions/, and data
 * session dirs).
 * @param fs - the filesystem service.
 * @param target - the directory to walk.
 * @param rel - the relative path prefix for recursion.
 * @returns product file contents by repository-relative path.
 */
export async function collectProductFiles(fs: FileSystem, target: FsTarget, rel = ''): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  for (const entry of await fs.listDir(target)) {
    const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`
    const top = String(childRel.split('/')[0])
    if (EXCLUDED_TOP_LEVEL.has(top)) continue
    if (top === 'data' && childRel.split('/').length > 2) continue
    if (entry.type === 'directory') {
      for (const [path, content] of await collectProductFiles(fs, entry.target, childRel)) files.set(path, content)
    } else if (entry.type === 'file') {
      files.set(childRel, await fs.readText(entry.target))
    }
  }
  return files
}

/**
 * Snapshot product files into `versions/<name>`; returns the version id.
 * @param fs - the filesystem service.
 * @param directory - the app-package directory.
 * @param name - optional version id; defaults to a timestamp.
 * @returns the version id.
 */
export async function snapshotVersion(fs: FileSystem, directory: string, name?: string): Promise<string> {
  const files = await collectProductFiles(fs, await fs.resolve(directory))
  const version = name ?? new Date().toISOString().replace(/[:.]/g, '-')
  const versionRoot = await fs.resolve(`${directory}/versions/${version}`)
  for (const [rel, content] of files) {
    await fs.writeText(await fs.resolve(`${versionRoot.displayPath}/${rel}`), content)
  }
  return version
}

/**
 * Restore one version's files over the working directory; returns file count.
 * @param fs - the filesystem service.
 * @param directory - the app-package directory.
 * @param version - the version id to restore.
 * @returns the number of files restored.
 */
export async function restoreVersion(fs: FileSystem, directory: string, version: string): Promise<number> {
  const files = await collectProductFiles(fs, await fs.resolve(`${directory}/versions/${version}`))
  let count = 0
  for (const [rel, content] of files) {
    await fs.writeText(await fs.resolve(`${directory}/${rel}`), content)
    count += 1
  }
  return count
}

/**
 * List version directories, newest first; empty when none exist.
 * @param fs - the filesystem service.
 * @param directory - the app-package directory.
 * @returns version ids in newest-first order.
 */
export async function listVersions(fs: FileSystem, directory: string): Promise<string[]> {
  const target = await fs.resolve(`${directory}/versions`)
  const info = await fs.stat(target)
  if (info === undefined) return []
  const entries = await fs.listDir(target)
  return entries.filter(entry => entry.type === 'directory').map(entry => entry.name).sort().reverse()
}

/** Canonical tool value. */
export interface AppPackageVersionResult {
  ok: boolean
  action: string
  version?: string
  versions?: string[]
  restored?: number
}

/**
 * Pure terminal presentation.
 * @param value - the version-action result.
 * @returns the rendered terminal lines.
 */
export function renderResult(value: AppPackageVersionResult): { type: 'text'; text: string }[] {
  const lines = [`apppackage_version: ${value.action}`]
  if (value.version !== undefined) lines.push(`  version: ${value.version}`)
  if (value.restored !== undefined) lines.push(`  restored files: ${value.restored}`)
  if (value.versions !== undefined) {
    lines.push(`  versions (${value.versions.length}):`)
    for (const version of value.versions) lines.push(`    ${version}`)
  }
  return [{ type: 'text', text: lines.join('\n') }]
}

/**
 * Register `apppackage_version`. Snapshots copy product files into
 * `versions/`; restore copies a version back; list reports snapshots.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'apppackage_version',
    description: 'Manage local app-package versions: snapshot product files into versions/, list snapshots, or restore one over the working directory. Run snapshot before platform sync or before an adopted publish.',
    parameters: {
      directory: {
        type: 'string',
        required: true,
        description: 'Absolute path of the app-package directory.',
      },
      action: {
        type: 'string',
        required: true,
        enum: ['snapshot', 'list', 'restore'],
      },
      version: {
        type: 'string',
        description: 'Version id for restore; optional for snapshot (defaults to a timestamp).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          action: { type: 'string', required: true },
          version: { type: 'string' },
          versions: { type: 'array', items: { type: 'string' } },
          restored: { type: 'integer' },
        },
      },
      render: (_args, value) => renderResult(value),
    },
    async execute(args) {
      if (args.action === 'snapshot') {
        const version = await snapshotVersion(ctx.fs, args.directory, args.version)
        return { ok: true, action: 'snapshot', version }
      }
      if (args.action === 'list') {
        const versions = await listVersions(ctx.fs, args.directory)
        return { ok: true, action: 'list', versions }
      }
      if (args.version === undefined) throw new Error('apppackage_version: restore requires version')
      const restored = await restoreVersion(ctx.fs, args.directory, args.version)
      return { ok: true, action: 'restore', version: args.version, restored }
    },
  }))
}
