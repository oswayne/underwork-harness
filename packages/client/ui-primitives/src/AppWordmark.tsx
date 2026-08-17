// Generic wordmark atom: the brand mark plus the product name, composed at
// the given cap height. Ink rides currentColor; src/name come from the
// composing application so the package carries no product-specific values.

import { AppLogo, type AppLogoProps } from './AppLogo.tsx'

/** AppWordmark props: the shared icon sizing plus the brand mark and name. */
export interface AppWordmarkProps extends AppLogoProps {
  /** Product name shown next to the mark. */
  name: string
}

/**
 * Render the full brand wordmark.
 * @param props.size - cap height in px (default 24; the mark and text scale together).
 * @param props.className - extra class for layout placement.
 * @param props.src - the brand mark image URL.
 * @param props.name - the product name.
 * @returns the wordmark row (aria-hidden decorative brand art).
 */
export function AppWordmark({ size = 24, className, src, name }: AppWordmarkProps) {
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
      <AppLogo size={size} src={src} />
      {name}
    </span>
  )
}
