// Underwork Harness brand wordmark: the app icon plus the product name,
// composed at the given cap height. Ink rides currentColor.

import type { IconProps } from './icons/props.ts'
import { AppLogo } from './AppLogo.tsx'

/**
 * Render the full brand wordmark.
 * @param props.size - cap height in px (default 24; the mark and text scale together).
 * @param props.className - extra class for layout placement.
 * @returns the wordmark row (aria-hidden decorative brand art).
 */
export function AppWordmark({ size = 24, className }: IconProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size * 0.375,
        height: size,
        color: 'currentColor',
        whiteSpace: 'nowrap',
        fontSize: size * 0.625,
        fontWeight: 600,
        letterSpacing: size * 0.015625,
      }}
    >
      <AppLogo size={size} />
      Underwork Harness
    </span>
  )
}
