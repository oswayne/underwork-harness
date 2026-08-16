/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-sandbox-server`.
 * @module @deepseek-ai/dsh-sandbox-server/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-sandbox-server'

/** Cordis companion plugin name. */
export const name = 'sandbox-server-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: sandbox data is per-session and ephemeral; its query
 * and execution semantics are pinned by unit and contract tests.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
