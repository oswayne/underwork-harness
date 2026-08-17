// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { zh } from '../src/locales.ts'
import { PreviewAction, type PreviewActionInjected } from '../src/client/PreviewAction.tsx'

const t = ((key: string) => zh[key as keyof typeof zh] ?? key) as never

describe('PreviewAction', () => {
  it('renders a button that opens the details column', () => {
    const openDetails = vi.fn()
    render(<PreviewAction
      {...{ t, openDetails } as unknown as PropsRuntime<'conversation.session.header.actions'> & PreviewActionInjected & PropsLocale<'apppackage'>}
    />)
    const button = screen.getByRole('button', { name: '预览' })
    fireEvent.click(button)
    expect(openDetails).toHaveBeenCalledOnce()
  })
})
