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
      src: '/uicp-logo.png',
      sizes: '1024x1032',
      type: 'image/png',
      purpose: 'any',
    }],
  })
})

it('ships the Underwork Harness logo as the browser icon', async () => {
  const logo = await readFile(join(DIST_ROOT, 'uicp-logo.png'))
  expect(logo.subarray(0, 4).toString('latin1')).toBe('\u0089PNG')
})
