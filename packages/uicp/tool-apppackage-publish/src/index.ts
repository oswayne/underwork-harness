/**
 * Model-facing API save for UICP app packages. Requires explicit user
 * adoption; fixture data is never written to the platform.
 * @module @deepseek-ai/dsh-tool-apppackage-publish
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { HttpPlatformClient } from './client.ts'
import { publishPackage, type PublishSummary } from './publish.ts'

export const name = 'tool-apppackage-publish'
export const inject = ['tools']

/** Pure terminal presentation of the canonical result. */
export function renderResult(value: PublishSummary): { type: 'text'; text: string }[] {
  const created = value.created
  const lines = [
    `apppackage_publish: ${value.ok ? 'OK' : 'FAIL'} app=${value.appId}`,
    `  created: app=${created.app} entities=${created.entities} fields=${created.fields} funcs=${created.funcs} menu=${created.menu} page=${created.page}`,
  ]
  return [{ type: 'text', text: lines.join('\n') }]
}

/**
 * Register `apppackage_publish`. The caller must pass `adopted: true` (the
 * user's explicit adoption gate); the tool then upserts the directory onto the
 * platform idempotently.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'apppackage_publish',
    description: 'Save an app-package directory to the uicp platform after the user adopts it. Idempotent upsert in App → Entity → fields → funcs → menu → page order; test data is never written. Requires adopted=true.',
    parameters: {
      directory: {
        type: 'string',
        required: true,
        description: 'Absolute path of the app-package directory.',
      },
      baseUrl: { type: 'string', required: true, description: 'Platform API base URL, e.g. https://api.underwork.cn/uicp.' },
      token: { type: 'string', required: true, description: 'Platform JWT for the Authorization header.' },
      tenantId: { type: 'string', required: true, description: 'Tenant ObjectId for the Tenant header.' },
      adopted: { type: 'boolean', required: true, description: 'Must be true: the user explicitly adopted this package for publication.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          appId: { type: 'string', required: true },
          created: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
              app: { type: 'boolean', required: true },
              entities: { type: 'integer', required: true },
              fields: { type: 'integer', required: true },
              funcs: { type: 'integer', required: true },
              menu: { type: 'boolean', required: true },
              page: { type: 'boolean', required: true },
            },
          },
        },
      },
      render: (_args, value) => renderResult(value),
    },
    async execute(args) {
      if (!args.adopted) throw new Error('apppackage_publish: 用户未采纳，拒绝写入平台')
      const client = new HttpPlatformClient(args.baseUrl, args.token, args.tenantId)
      return await publishPackage(args.directory, client)
    },
  }))
}
