/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tool-apppackage-publish`.
 * @module @deepseek-ai/dsh-tool-apppackage-publish/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-apppackage-publish'

/** Cordis companion plugin name. */
export const name = 'tool-apppackage-publish-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: publishing is a request-response action over the
 * platform API and owns no durable local event stream.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
