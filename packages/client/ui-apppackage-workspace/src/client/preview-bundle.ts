declare global {
  interface Window {
    UicpEurekaPreview?: {
      mountEurekaPreview: (
        container: Element,
        schema: unknown,
        env: { fetcher: (request: { url: string; method: string; data?: unknown }) => Promise<unknown> },
      ) => { unmount: () => void }
      mountEurekaEditor: (
        container: Element,
        schema: unknown,
        env: { onSave: (value: unknown) => void; preview?: boolean; isMobile?: boolean },
      ) => { getValue: () => unknown; setValue: (next: unknown) => void; save: () => void; unmount: () => void }
    }
  }
}

/**
 * Load the self-contained eureka preview/editor IIFE once and resolve the
 * bundle API it exposes on `window.UicpEurekaPreview`.
 * @returns the bundle API.
 */
export function loadPreviewBundle(): Promise<NonNullable<Window['UicpEurekaPreview']>> {
  return new Promise((resolve, reject) => {
    const ready = (): void => {
      const api = window.UicpEurekaPreview
      if (api !== undefined) resolve(api)
      else reject(new Error('preview bundle did not expose UicpEurekaPreview'))
    }
    if (window.UicpEurekaPreview !== undefined) {
      resolve(window.UicpEurekaPreview)
      return
    }
    const existing = document.querySelector('script[data-uicp-preview]')
    if (existing !== null && existing instanceof HTMLScriptElement) {
      existing.addEventListener('load', () => { ready() }, { once: true })
      return
    }
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = '/uicp/preview/bundle.css'
    css.dataset.uicpPreview = ''
    document.head.appendChild(css)
    const script = document.createElement('script')
    script.src = '/uicp/preview/bundle.js'
    script.dataset.uicpPreview = ''
    script.addEventListener('load', () => { ready() }, { once: true })
    script.addEventListener('error', () => {
      reject(new Error('preview bundle failed to load'))
    }, { once: true })
    document.head.appendChild(script)
  })
}
