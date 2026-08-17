// Generic logo atom: renders a square brand mark image at the requested size.
// The src is provided by the composing application, so the package carries no
// product-specific asset path. Decorative (empty alt) like the wordmark.

import type { IconProps } from './icons/props.ts'

/** AppLogo props: the shared icon sizing plus the brand mark source. */
export interface AppLogoProps extends IconProps {
  /** Brand mark image URL (web asset path). */
  src: string
}

/**
 * Render the brand mark.
 * @param props.size - width and height in px (default 24).
 * @param props.className - extra class for layout placement.
 * @param props.src - the brand mark image URL.
 * @returns the mark img (decorative; pair with the wordmark for accessibility).
 */
export function AppLogo({ size = 24, className, src }: AppLogoProps) {
  return (
    <img
      src={src}
      width={size}
      height={size}
      className={className}
      alt=""
      draggable={false}
    />
  )
}
