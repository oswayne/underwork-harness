// Underwork brand occupants for the generic browser-brand slots. The fork's
// product is the UICP web app, so this plugin (mounted only in the uicp
// bundle) fills the slots the base shell leaves as generic fallbacks.

import { AppLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps, SidebarBrandNameOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

const APP_LOGO_SRC = '/app-icon.svg'
const APP_NAME = 'Underwork Harness'

type UnderworkBrandMarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps

/**
 * Render the Underwork brand mark with the presentation requested by its host
 * surface.
 * @param props - Host-supplied mark presentation.
 * @returns the brand mark image.
 */
export function UnderworkBrandMark({ size, className }: UnderworkBrandMarkProps) {
  return <AppLogo size={size} className={className} src={APP_LOGO_SRC} />
}

/**
 * Render the Underwork product name beside the expanded mark.
 * @param _props - Empty owner share (the occupant owns its own content).
 * @returns the product-name text.
 */
export function UnderworkBrandName(_props: SidebarBrandNameOwnerProps) {
  return <span>{APP_NAME}</span>
}
