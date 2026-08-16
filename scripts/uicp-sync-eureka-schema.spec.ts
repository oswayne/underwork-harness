import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fingerprint, syncSchema } from './uicp-sync-eureka-schema.ts'

describe('syncSchema', () => {
  it('reports up-to-date, syncs drift, and checks without writing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uicp-schema-'))
    try {
      const source = join(dir, 'installed.json')
      const target = join(dir, 'vendored.json')
      writeFileSync(source, '{"v":1}')

      expect(syncSchema(false, source, target)).toMatchObject({ synced: true })
      expect(readFileSync(target, 'utf8')).toBe('{"v":1}')
      expect(syncSchema(true, source, target).message).toContain('up to date')

      writeFileSync(source, '{"v":2}')
      const check = syncSchema(true, source, target)
      expect(check.synced).toBe(false)
      expect(check.message).toContain('drift')
      expect(readFileSync(target, 'utf8')).toBe('{"v":1}')

      expect(syncSchema(false, source, target).message).toContain('synced')
      expect(readFileSync(target, 'utf8')).toBe('{"v":2}')
      expect(fingerprint(readFileSync(source))).toHaveLength(12)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports drift when the vendored schema is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uicp-schema-'))
    try {
      const source = join(dir, 'installed.json')
      const target = join(dir, 'missing.json')
      writeFileSync(source, '{"v":1}')
      const outcome = syncSchema(true, source, target)
      expect(outcome.synced).toBe(false)
      expect(outcome.message).toContain('missing')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
