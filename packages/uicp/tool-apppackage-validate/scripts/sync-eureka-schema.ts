/**
 * Sync the vendored Eureka page schema snapshot used by apppackage_validate.
 * Copies `packages/eureka/schema.json` from the Eureka checkout (the build
 * product, not the source schema) and records the synced version. Run after
 * upgrading Eureka; `EUREKA_ROOT` overrides the default checkout path.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const eurekaRoot = resolve(process.env.EUREKA_ROOT ?? '/Users/wayne/Documents/Projects/eureka')
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(eurekaRoot, 'packages', 'eureka', 'schema.json')
const targetDir = join(packageDir, 'data')
const target = join(targetDir, 'eureka-schema.json')

const eurekaManifest = JSON.parse(readFileSync(join(eurekaRoot, 'packages', 'eureka', 'package.json'), 'utf8')) as {
  version?: string
}
const version = eurekaManifest.version
if (typeof version !== 'string' || version === '') throw new Error(`Eureka 版本缺失: ${join(eurekaRoot, 'packages', 'eureka', 'package.json')}`)
if (!existsSync(source)) throw new Error(`Eureka schema 构建产物不存在: ${source}`)

mkdirSync(targetDir, { recursive: true })
copyFileSync(source, target)
writeFileSync(join(targetDir, 'eureka-version.json'), `${JSON.stringify({
  version,
  syncedAt: new Date().toISOString(),
}, null, 2)}\n`)
console.log(`synced eureka schema v${version} -> ${target}`)
