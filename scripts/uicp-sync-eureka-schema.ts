/**
 * Keep the vendored Eureka schema in `tool-apppackage-validate` aligned with
 * the pinned `eureka` package installed in this workspace.
 *
 * Usage:
 *   pnpm run sync:eureka-schema            # copy the installed schema over
 *   pnpm run sync:eureka-schema -- --check # fail on drift, write nothing
 * @module
 */

import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

/** Vendored schema path consumed by `@deepseek-ai/dsh-tool-apppackage-validate`. */
export const TARGET_SCHEMA = resolve('packages/uicp/tool-apppackage-validate/data/eureka-schema.json')

/** Resolve the installed `eureka` package's schema export. */
export function installedSchemaPath(): string {
  return require.resolve('eureka/schema.json')
}

/** Short content fingerprint for drift messages. */
export function fingerprint(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 12)
}

/**
 * Sync outcome.
 * @param synced - true when the target was written or already matched.
 * @param message - human-readable status line.
 */
export interface SyncOutcome {
  synced: boolean
  message: string
}

/**
 * Compare and optionally sync the vendored schema.
 * @param check - only report drift, never write.
 * @param source - installed schema path.
 * @param target - vendored schema path.
 * @returns the outcome; `synced: false` means drift and (in check mode) failure.
 */
export function syncSchema(check: boolean, source: string, target: string): SyncOutcome {
  const installed = readFileSync(source)
  const vendored = existsSync(target) ? readFileSync(target) : null
  if (vendored !== null && vendored.equals(installed)) {
    return { synced: true, message: `eureka-schema.json up to date (${fingerprint(installed)})` }
  }
  if (check) {
    return {
      synced: false,
      message: `drift: vendored ${vendored === null ? 'missing' : fingerprint(vendored)} != installed ${fingerprint(installed)}; run without --check to sync`,
    }
  }
  writeFileSync(target, installed)
  return { synced: true, message: `eureka-schema.json synced (${fingerprint(installed)})` }
}

function main(): void {
  const outcome = syncSchema(process.argv.includes('--check'), installedSchemaPath(), TARGET_SCHEMA)
  if (outcome.synced) {
    console.log(outcome.message)
  } else {
    console.error(outcome.message)
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
