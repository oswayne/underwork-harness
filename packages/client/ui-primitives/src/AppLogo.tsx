// Underwork Harness app icon (desktop/icons/icon.svg, served as
// /app-icon.svg by the web shell): the rounded brand mark. Rendered square
// at the requested size; decorative (alt-less) like the wordmark.

import type { IconProps } from './icons/props.ts'

/**
 * Render the app icon.
 * @param props.size - width and height in px (default 24).
 * @param props.className - extra class for layout placement.
 * @returns the icon img (decorative; pair with the wordmark for accessibility).
 */
export function AppLogo({ size = 24, className }: IconProps) {
  return (
    <img
      src="/app-icon.svg"
      width={size}
      height={size}
      className={className}
      alt=""
    />
  )
}
