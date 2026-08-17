/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-uicp-api-proxy`.
 * @module @deepseek-ai/dsh-uicp-api-proxy/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-uicp-api-proxy'

/** Cordis companion plugin name. */
export const name = 'uicp-api-proxy-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the proxy forwards HTTP and owns no event stream or
 * durable data.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
