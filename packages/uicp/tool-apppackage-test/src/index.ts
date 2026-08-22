/**
 * Model-facing automated test runner: generates cases from the app-package
 * contract, runs them against the local sandbox, and reports pass/fail/skip.
 * @module @deepseek-ai/dsh-tool-apppackage-test
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  loadPackage, MemoryKvBackend, SandboxExecutor, SandboxRouter, SandboxStore,
} from '@deepseek-ai/dsh-sandbox-server'
import { generateCases, type TestCase } from './cases.ts'
import { runSuite, type CaseResult } from './runner.ts'

export const name = 'tool-apppackage-test'
export const inject = ['fs', 'tools']

/**
 * Load `data/<entity>.json` fixtures into a map keyed by entity identifier.
 * @param packageDir - the app-package directory.
 * @returns fixtures by entity identifier.
 */
export function loadFixtures(packageDir: string): Map<string, Record<string, unknown>[]> {
  const fixtures = new Map<string, Record<string, unknown>[]>()
  const dataDir = join(packageDir, 'data')
  for (const file of readdirSync(dataDir).filter(name => name.endsWith('.json'))) {
    const identifier = file.slice(0, -'.json'.length)
    fixtures.set(identifier, JSON.parse(readFileSync(join(dataDir, file), 'utf8')) as Record<string, unknown>[])
  }
  return fixtures
}

/** Canonical tool value: counts plus per-case outcomes. */
export interface AppPackageTestResult {
  ok: boolean
  cases: number
  passed: number
  failed: number
  results: CaseResult[]
}

/**
 * Pure terminal presentation of the canonical result.
 * @param value - the test-run summary.
 * @returns the rendered terminal lines.
 */
export function renderResult(value: AppPackageTestResult): { type: 'text'; text: string }[] {
  const lines = [`apppackage_test: ${value.ok ? 'PASS' : 'FAIL'} (${value.passed}/${value.cases})`]
  for (const result of value.results) {
    const marker = result.skipped !== undefined ? 'SKIP' : result.passed ? 'PASS' : 'FAIL'
    lines.push(`  [${marker}] ${result.name}${result.passed && result.message !== 'ok' ? ` — ${result.message}` : ''}`)
  }
  return [{ type: 'text', text: lines.join('\n') }]
}

/**
 * Register `apppackage_test`. Builds an in-process sandbox from the package
 * directory, seeds fixtures, runs the generated suite, and persists the cases
 * to `tests/apppackage.cases.json` for review.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'apppackage_test',
    description: 'Generate and run automated tests for an app-package directory against the local sandbox (positive, negative, and boundary cases), then report structured results. Run after apppackage_validate and before adoption.',
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
          cases: { type: 'integer', required: true },
          passed: { type: 'integer', required: true },
          failed: { type: 'integer', required: true },
          results: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                passed: { type: 'boolean', required: true },
                skipped: { type: 'string' },
                message: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => renderResult(value),
    },
    async execute(args) {
      const { entities, funcs } = loadPackage(args.directory)
      const fixtures = loadFixtures(args.directory)
      const store = new SandboxStore(new MemoryKvBackend(), entities)
      for (const [identifier, records] of fixtures) {
        for (const record of records) await store.insert(identifier, record)
      }
      const executor = new SandboxExecutor(store, funcs)
      const router = new SandboxRouter({ store, executor, entities, funcs })
      const cases: TestCase[] = generateCases(entities, funcs, fixtures)
      const results = await runSuite(router, cases)
      const passed = results.filter(result => result.passed).length
      const failed = results.length - passed
      const target = await ctx.fs.resolve(`${args.directory}/tests/apppackage.cases.json`)
      await ctx.fs.writeText(target, JSON.stringify(cases, null, 2))
      return {
        ok: failed === 0,
        cases: cases.length,
        passed,
        failed,
        results,
      }
    },
  }))
}
