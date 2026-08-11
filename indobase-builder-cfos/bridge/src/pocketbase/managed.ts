/**
 * Managed Indobase backend (PocketBase engine — never named in user-facing copy).
 */
export type ManagedBackendConfig = {
  publicUrl: string
  adminUrl: string
  adminEmail: string
  adminPassword: string
}

function readEnv(key: string): string | undefined {
  const value = process.env[key]?.trim()
  return value || undefined
}

export function getManagedBackendConfig(): ManagedBackendConfig | null {
  const publicUrl = (readEnv('POCKETBASE_PUBLIC_URL') || readEnv('POCKETBASE_URL') || '').replace(
    /\/+$/,
    '',
  )
  const adminUrl = (
    readEnv('POCKETBASE_ADMIN_URL') ||
    readEnv('POCKETBASE_URL') ||
    publicUrl
  ).replace(/\/+$/, '')
  const adminEmail = readEnv('POCKETBASE_ADMIN_EMAIL')
  const adminPassword = readEnv('POCKETBASE_ADMIN_PASSWORD')

  if (!publicUrl || !adminUrl || !adminEmail || !adminPassword) {
    return null
  }

  return { publicUrl, adminUrl, adminEmail, adminPassword }
}

export function isManagedBackendConfigured(): boolean {
  return Boolean(getManagedBackendConfig())
}

export function createAppId(seed?: string): string {
  const raw = (seed || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  return raw.slice(0, 10) || `app${Date.now().toString(36).slice(-6)}`
}

export function physicalCollectionName(appId: string, logicalName: string): string {
  const safeLogical = logicalName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  const base = safeLogical || 'items'
  return `ib_${appId}_${base}`.slice(0, 100)
}

export async function adminAuth(config: ManagedBackendConfig): Promise<string> {
  const attempts = [
    `${config.adminUrl}/api/collections/_superusers/auth-with-password`,
    `${config.adminUrl}/api/admins/auth-with-password`,
  ]

  let lastError = 'Indobase backend admin auth failed'

  for (const endpoint of attempts) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity: config.adminEmail,
          password: config.adminPassword,
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        token?: string
        message?: string
      }
      if (response.ok && payload.token) {
        return payload.token
      }
      lastError = payload.message || `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  throw new Error(lastError)
}

export function buildBrandedBackend(options: {
  publicUrl: string
  appId: string
  projectName?: string
}): NonNullable<import('@indobase/platform-api').OsWorkspaceSession['backend']> {
  const api = options.publicUrl.replace(/\/+$/, '')
  const projectRef = options.appId
  const projectName = options.projectName || 'Indobase backend'
  return {
    anon_key: 'indobase-backend',
    api_url: api,
    auth_url: api,
    project_name: projectName,
    project_ref: projectRef,
    project_url: api,
    rest_url: api,
    storage_url: api,
  }
}

export async function ensureManagedBackend(options?: {
  appId?: string
  seed?: string
}): Promise<{ url: string; appId: string; backend: ReturnType<typeof buildBrandedBackend> }> {
  const config = getManagedBackendConfig()
  if (!config) {
    throw new Error('Indobase backend is not configured')
  }

  const health = await fetch(`${config.adminUrl}/api/health`).catch(() => null)
  if (!health?.ok) {
    throw new Error('Indobase backend is unreachable')
  }

  await adminAuth(config)
  const appId = options?.appId?.trim() || createAppId(options?.seed)

  return {
    url: config.publicUrl,
    appId,
    backend: buildBrandedBackend({ publicUrl: config.publicUrl, appId }),
  }
}

export type SchemaField = {
  name: string
  type?: string
  required?: boolean
}

function mapPgTypeToPb(type?: string): string {
  const t = (type || 'text').toLowerCase()
  if (t.includes('bool')) return 'bool'
  if (t.includes('int') || t.includes('numeric') || t.includes('float') || t.includes('double')) {
    return 'number'
  }
  if (t.includes('json')) return 'json'
  if (t.includes('date') || t.includes('time')) return 'date'
  if (t.includes('uuid')) return 'text'
  return 'text'
}

export async function ensureCollection(options: {
  appId: string
  name: string
  fields?: SchemaField[]
}): Promise<{ name: string; logicalName: string; id?: string; created: boolean }> {
  const config = getManagedBackendConfig()
  if (!config) {
    throw new Error('Indobase backend is not configured')
  }

  const token = await adminAuth(config)
  const logicalName = options.name.trim()
  const collectionName = physicalCollectionName(options.appId, logicalName)
  const fields = (options.fields || [])
    .filter((field) => field.name?.trim() && field.name.trim().toLowerCase() !== 'id')
    .map((field) => ({
      name: field.name.trim(),
      type: mapPgTypeToPb(field.type),
      required: Boolean(field.required),
    }))

  const listResponse = await fetch(`${config.adminUrl}/api/collections?page=1&perPage=200`, {
    headers: { Authorization: token },
  })
  const listPayload = (await listResponse.json().catch(() => ({}))) as {
    items?: Array<{ id: string; name: string }>
  }
  const existing = listPayload.items?.find((item) => item.name === collectionName)
  if (existing) {
    return { name: collectionName, logicalName, id: existing.id, created: false }
  }

  const createResponse = await fetch(`${config.adminUrl}/api/collections`, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: collectionName,
      type: 'base',
      fields,
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
    }),
  })
  const createPayload = (await createResponse.json().catch(() => ({}))) as {
    id?: string
    name?: string
    message?: string
  }
  if (!createResponse.ok) {
    throw new Error(createPayload.message || `Failed to create collection ${collectionName}`)
  }

  return {
    name: createPayload.name || collectionName,
    logicalName,
    id: createPayload.id,
    created: true,
  }
}
