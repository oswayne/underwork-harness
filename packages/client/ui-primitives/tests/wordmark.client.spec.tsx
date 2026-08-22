// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppWordmark } from '../src/AppWordmark.tsx'

afterEach(cleanup)

describe('AppWordmark', () => {
  it('renders the logo image beside the product name at the default cap height', () => {
    const { container } = render(<AppWordmark name="Underwork" src="/underwork.svg" />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('/underwork.svg')
    const span = container.querySelector('span')!
    expect(span.textContent).toBe('Underwork')
    expect(span.style.height).toBe('24px')
    expect(span.style.fontSize).toBe('15px')
  })

  it('applies className and a custom size', () => {
    const { container } = render(<AppWordmark name="X" src="/x.svg" size={32} className="brand" />)
    const span = container.querySelector('span')!
    expect(span.classList.contains('brand')).toBe(true)
    expect(span.style.height).toBe('32px')
    expect(span.style.fontSize).toBe('20px')
  })
})
