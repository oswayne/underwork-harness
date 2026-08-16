import { describe, expect, it } from 'vitest'
import { en, zh } from '../src/locales.ts'

describe('ui-uicp-nav locales', () => {
  it('keeps both dictionaries on the same key set', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    expect(zh['login.title']).toBe('登录')
    expect(en['nav.sessions']).toBe('Sessions')
  })
})
