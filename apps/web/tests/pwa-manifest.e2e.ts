import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))

it('ships install metadata with the built web application', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<link rel="manifest" href="/manifest.webmanifest" />')

  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  expect(manifest).toEqual({
    id: '/',
    name: 'Underwork Harness',
    short_name: 'Underwork',
    start_url: '/',
    scope: '/',
    display: 'fullscreen',
    icons: [{
      src: '/app-icon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any',
    }],
  })
})

it('ships the Underwork Harness app icon as the browser icon', async () => {
  const icon = await readFile(join(DIST_ROOT, 'app-icon.svg'), 'utf8')
  expect(icon).toContain('<svg')
})
