/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-uicp-user-identity`.
 * @module @deepseek-ai/dsh-uicp-user-identity/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-uicp-user-identity'

/** Cordis companion plugin name. */
export const name = 'uicp-user-identity-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the seam answers an HTTP route and owns no event
 * stream; its durable file is an append-only user ledger.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
