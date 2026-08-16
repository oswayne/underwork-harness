import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as NavInvariant from '@deepseek-ai/dsh-client-ui-uicp-nav/invariant'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'

describe('invariant companion', () => {
  it('registers under the package name with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(NavInvariant).await()).resolves.toBeDefined()
  })
})
