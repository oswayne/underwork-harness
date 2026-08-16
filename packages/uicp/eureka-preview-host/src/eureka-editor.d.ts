/**
 * The published `eureka-editor` package ships no usable declarations; declare
 * the `Editor` component surface this host consumes (mirrors the platform
 * integration in uicp-web-editor).
 */
declare module 'eureka-editor' {
  import type { ComponentType } from 'react'

  interface EditorProps {
    value: unknown
    onChange: (value: unknown) => void
    preview?: boolean
    isMobile?: boolean
    className?: string
    eurekaDocHost?: string
    eurekaEnv?: unknown
    showCustomRenderersPanel?: boolean
  }

  export const Editor: ComponentType<EditorProps>
}
