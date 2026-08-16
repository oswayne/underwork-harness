/** Thin HTTP client over the uicp platform APIs (Authorization + Tenant). */

export interface PlatformRecord {
  _id: string
  [key: string]: unknown
}

/** Platform surface the publisher needs; tests inject a fake. */
export interface PlatformClient {
  listApps(): Promise<PlatformRecord[]>
  createApp(body: Record<string, unknown>): Promise<string>
  listEntities(appId: string): Promise<PlatformRecord[]>
  createEntity(body: Record<string, unknown>): Promise<string>
  listFields(entityId: string): Promise<PlatformRecord[]>
  createField(body: Record<string, unknown>): Promise<void>
  listFuncs(entityId: string): Promise<PlatformRecord[]>
  createFunc(body: Record<string, unknown>): Promise<void>
  listMenus(appId: string): Promise<PlatformRecord[]>
  createMenu(body: Record<string, unknown>): Promise<string>
  getPage(menuId: string): Promise<Record<string, unknown> | null>
  createPage(menuId: string, schema: unknown): Promise<void>
}

function recordId(response: unknown): string {
  const wrapped = response as { data?: PlatformRecord }
  const id = wrapped.data?._id ?? (response as PlatformRecord)._id
  if (typeof id !== 'string') throw new Error(`平台响应缺少 _id: ${JSON.stringify(response).slice(0, 200)}`)
  return id
}

/** HTTP implementation using global fetch. */
export class HttpPlatformClient implements PlatformClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly tenantId: string,
  ) {}

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.token,
        Tenant: this.tenantId,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (!response.ok) throw new Error(`平台请求失败 ${method} ${path}: ${response.status}`)
    return await response.json() as unknown
  }

  private async list(path: string): Promise<PlatformRecord[]> {
    const response = await this.request('GET', path) as { data?: PlatformRecord[] }
    return response.data ?? []
  }

  async listApps(): Promise<PlatformRecord[]> {
    return this.list('/app-package/list')
  }

  async createApp(body: Record<string, unknown>): Promise<string> {
    return recordId(await this.request('POST', '/app-package', body))
  }

  async listEntities(appId: string): Promise<PlatformRecord[]> {
    return this.list(`/app-package/entity/list?app=${appId}`)
  }

  async createEntity(body: Record<string, unknown>): Promise<string> {
    return recordId(await this.request('POST', '/app-package/entity', body))
  }

  async listFields(entityId: string): Promise<PlatformRecord[]> {
    return this.list(`/app-package/entity/field/list?entity=${entityId}`)
  }

  async createField(body: Record<string, unknown>): Promise<void> {
    await this.request('POST', '/app-package/entity/field', body)
  }

  async listFuncs(entityId: string): Promise<PlatformRecord[]> {
    return this.list(`/app-package/entity/func/list?entity=${entityId}`)
  }

  async createFunc(body: Record<string, unknown>): Promise<void> {
    await this.request('POST', '/app-package/entity/func', body)
  }

  async listMenus(appId: string): Promise<PlatformRecord[]> {
    return this.list(`/app-package/menu/list?app=${appId}`)
  }

  async createMenu(body: Record<string, unknown>): Promise<string> {
    return recordId(await this.request('POST', '/app-package/menu', body))
  }

  async getPage(menuId: string): Promise<Record<string, unknown> | null> {
    const response = await this.request('GET', `/app-package/menu/${menuId}/page`) as { data?: Record<string, unknown> }
    const page = response.data
    return page !== undefined && page.type === 'page' && page.title !== '未配置' ? page : null
  }

  async createPage(menuId: string, schema: unknown): Promise<void> {
    await this.request('POST', `/app-package/menu/${menuId}/page`, schema)
  }
}
