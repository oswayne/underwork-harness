/**
 * Self-contained Eureka page preview (React 19) for the UICP low-code driver.
 * The caller mounts a page JSON into any DOM node; the bundle carries its own
 * React 19 + eureka runtime, so the hosting app's React version is irrelevant.
 * @module @deepseek-ai/dsh-eureka-preview-host
 */

// Eureka preview styling, mirroring the uicp-web-editor entry: icon fonts,
// the cxd theme, and the shared helpers. All assets are inlined into the
// bundle CSS by the vite build (assetsInlineLimit), so the preview depends
// only on bundle.js + bundle.css. Relative paths sidestep the eureka exports
// map, which does not expose its css assets.
import '../node_modules/@fortawesome/fontawesome-free/css/all.min.css'
import '../node_modules/eureka/dist/themes/cxd.css'
import '../node_modules/eureka/dist/helper.css'

import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { render as renderEureka } from 'eureka'
import { AlertComponent, ToastComponent } from 'eureka-ui'

/** Eureka env callback contract (subset of what `renderEureka` requires). */
export interface EurekaPreviewEnv {
  /** Data fetcher; returns `{ status, msg, data }` platform responses. */
  fetcher: (request: { url: string; method: string; data?: unknown }) => Promise<unknown>
  /** Abort detection for in-flight requests. */
  isCancel?: (value: unknown) => boolean
  /** Clipboard copy fallback; default is a no-op. */
  copy?: (content: string) => void
  /** Eureka theme name; default `cxd`. */
  theme?: string
  /** Locale; default `zh-CN`. */
  locale?: string
}

/** Mounted preview handle; call `unmount` to tear the React 19 root down. */
export interface PreviewHandle {
  unmount: () => void
}

/**
 * Mount one Eureka page JSON into `container` with the caller's data fetcher.
 * @param container - DOM node receiving the preview.
 * @param schema - page JSON (top-level `type: "page"`).
 * @param env - fetcher and presentation options.
 * @returns handle whose `unmount` removes the preview.
 */
export function mountEurekaPreview(container: Element, schema: unknown, env: EurekaPreviewEnv): PreviewHandle {
  const theme = env.theme ?? 'cxd'
  const locale = env.locale ?? 'zh-CN'
  /* v8 ignore next -- the default cancel callback runs only on eureka request-cancellation paths the preview render tests do not trigger */
  const cancel = env.isCancel ?? (() => false)
  /* v8 ignore next -- the default copy callback runs only on eureka clipboard interactions the preview render tests do not trigger */
  const copy = env.copy ?? (() => {})
  const root: Root = createRoot(container)
  // Published eureka-ui types predate the theme/locale props its docs use.
  const toastProps = { theme, locale } as unknown as React.ComponentProps<typeof ToastComponent>
  const alertProps = { theme, locale } as unknown as React.ComponentProps<typeof AlertComponent>
  root.render(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(ToastComponent, toastProps),
      React.createElement(AlertComponent, alertProps),
      renderEureka(
        schema,
        {},
        {
          fetcher: env.fetcher,
          isCancel: cancel,
          copy,
          theme,
          locale,
        },
      ),
    ),
  )
  return { unmount: () => { root.unmount() } }
}
