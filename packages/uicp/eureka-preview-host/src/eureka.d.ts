/**
 * The published `eureka` package ships no declaration file; declare the render
 * entry this host consumes. Runtime behavior is pinned by the preview tests.
 */
declare module 'eureka' {
  import type { ReactElement } from 'react'

  export function render(
    schema: unknown,
    props: Record<string, unknown>,
    env: Record<string, unknown>,
  ): ReactElement
}
