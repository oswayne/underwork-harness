/** Idempotent diff-and-upsert of an app-package directory onto the platform. */

import { readFileSync } from 'node:fs'
import { loadPackage } from '@deepseek-ai/dsh-sandbox-server'
import type { PlatformClient } from './client.ts'

export interface PublishSummary {
  ok: boolean
  appId: string
  created: { app: boolean; entities: number; fields: number; funcs: number; menu: boolean; page: boolean }
}

/**
 * Upsert every record in creation order (App → Entity → fields → funcs →
 * menu → page), reusing existing records by identifier/path. Fixture data is
 * never written to the platform.
 */
export async function publishPackage(directory: string, client: PlatformClient): Promise<PublishSummary> {
  const { entities, funcs } = loadPackage(directory)
  const app = JSON.parse(readFileSync(`${directory}/app.json`, 'utf8')) as Record<string, unknown>
  const menus = JSON.parse(readFileSync(`${directory}/menus.json`, 'utf8')) as Record<string, unknown>[]
  const created = { app: false, entities: 0, fields: 0, funcs: 0, menu: false, page: false }

  let appId = (await client.listApps()).find(record => record.identifier === app.identifier)?._id
  if (appId === undefined) {
    appId = await client.createApp(app)
    created.app = true
  }

  for (const entity of entities.values()) {
    let entityId = (await client.listEntities(appId)).find(record => record.identifier === entity.identifier)?._id
    if (entityId === undefined) {
      entityId = await client.createEntity({ ...entity, app: appId })
      created.entities += 1
    }

    const existingFields = await client.listFields(entityId)
    for (const field of entity.fields) {
      if (!existingFields.some(record => record.name === field.name)) {
        await client.createField({ ...field, entity: entityId })
        created.fields += 1
      }
    }

    const existingFuncs = await client.listFuncs(entityId)
    for (const func of funcs.get(entity.identifier) ?? []) {
      if (!existingFuncs.some(record => record.identifier === func.identifier)) {
        await client.createFunc({
          identifier: func.identifier,
          name: func.name,
          comment: func.comment,
          type: func.type,
          body: func.body,
          entity: entityId,
        })
        created.funcs += 1
      }
    }
  }

  let menuId = (await client.listMenus(appId)).find(record => record.path === menus[0]?.path)?._id
  if (menuId === undefined) {
    menuId = await client.createMenu({ ...menus[0], app: appId })
    created.menu = true
  }

  const page = menus[0]?.page
  if (typeof page === 'string' && (await client.getPage(menuId)) === null) {
    const pageContent: unknown = JSON.parse(readFileSync(`${directory}/pages/${page}.json`, 'utf8'))
    await client.createPage(menuId, pageContent)
    created.page = true
  }

  return { ok: true, appId, created }
}
