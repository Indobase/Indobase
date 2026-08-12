/**
 * Managed Indobase backend (PocketBase engine — never named in user-facing copy).
 * Client ABI: records API under /api/collections/{physical}/records — not PostgREST /auth/v1.
 */
import { createHash, randomBytes } from 'node:crypto'

export type ManagedBackendConfig = {
  publicUrl: string
  adminUrl: string
  adminEmail: string
  adminPassword: string
}

/** Sentinel anon_key — engine has no Kong anon key; public rules + user JWT. */
export const MANAGED_PUBLIC_KEY = 'public'
export const MANAGED_PUBLIC_KEY_LEGACY = 'indobase-backend'

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

export function isManagedPublicKey(key: string | null | undefined): boolean {
  const k = (key || '').trim()
  return k === MANAGED_PUBLIC_KEY || k === MANAGED_PUBLIC_KEY_LEGACY
}

/** Stable, PB-safe app id from any workspace ref / email seed. */
export function sanitizeAppId(raw: string): string {
  const trimmed = raw.trim().toLowerCase()
  const cleaned = trimmed.replace(/[^a-z0-9]/g, '')
  // Only accept already-alnum ids as-is. If the input had separators (draft_foo,
  // emails, slugs), always hash so my-app / my_app / my.app cannot collide.
  const hadSeparators = /[^a-z0-9]/.test(trimmed)
  if (!hadSeparators && /^[a-z][a-z0-9]{5,15}$/.test(cleaned)) {
    return cleaned.slice(0, 16)
  }
  const hash = createHash('sha256').update(trimmed).digest('hex').slice(0, 10)
  const prefix = (cleaned.slice(0, 4) || 'app').replace(/^[^a-z]+/, '') || 'app'
  return `${prefix}${hash}`.slice(0, 14)
}

export function createAppId(seed?: string): string {
  const source =
    seed?.trim() ||
    `${Date.now().toString(36)}${randomBytes(6).toString('hex')}`
  return sanitizeAppId(source)
}

export function physicalCollectionName(appId: string, logicalName: string): string {
  const safeApp = sanitizeAppId(appId)
  const safeLogical = logicalName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  const base = safeLogical || 'items'
  return `ib_${safeApp}_${base}`.slice(0, 100)
}

export function collectionPrefix(appId: string): string {
  return `ib_${sanitizeAppId(appId)}_`
}

/** Normalize admin/user tokens for PocketBase (accepts raw or Bearer). */
export function adminAuthHeader(token: string): string {
  const t = token.trim()
  if (!t) return ''
  return t.toLowerCase().startsWith('bearer ') ? t : `Bearer ${t}`
}

export type PbErrorPayload = {
  message?: string
  data?: Record<string, unknown>
  status?: number
}

/** Human-readable PocketBase error including field validation `data`. */
export function formatPbError(
  payload: PbErrorPayload | null | undefined,
  fallback: string,
): string {
  const message = (payload?.message || '').trim() || fallback
  if (payload?.data && typeof payload.data === 'object' && Object.keys(payload.data).length) {
    try {
      return `${message} ${JSON.stringify(payload.data)}`
    } catch {
      return message
    }
  }
  return message
}

/** True when create-collection failed because the name already exists. */
export function isCollectionNameConflict(payload: PbErrorPayload | null | undefined): boolean {
  if (!payload) return false
  const message = String(payload.message || '')
  if (/unique|already|exists/i.test(message)) return true
  const data = payload.data
  if (!data || typeof data !== 'object') return false
  const nameErr = data.name
  if (nameErr && typeof nameErr === 'object') {
    const code = String((nameErr as { code?: string }).code || '')
    const msg = String((nameErr as { message?: string }).message || '')
    if (/unique|exists/i.test(code) || /unique|exists/i.test(msg)) return true
  }
  return false
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

export function buildManagedPublicEnv(options: {
  publicUrl: string
  appId: string
}): Record<string, string> {
  const api = options.publicUrl.replace(/\/+$/, '')
  const appId = sanitizeAppId(options.appId)
  const prefix = collectionPrefix(appId)
  return {
    INDOBASE_URL: api,
    INDOBASE_ANON_KEY: MANAGED_PUBLIC_KEY,
    PROJECT_REF: appId,
    INDOBASE_BACKEND_KIND: 'records',
    INDOBASE_COLLECTION_PREFIX: prefix,
    INDOBASE_RECORDS_BASE: `${api}/api/collections`,
    INDOBASE_AUTH_URL: `${api}/api/collections/users`,
    INDOBASE_REST_URL: `${api}/api/collections`,
    INDOBASE_STORAGE_URL: `${api}/api/files`,
    VITE_INDOBASE_URL: api,
    VITE_INDOBASE_ANON_KEY: MANAGED_PUBLIC_KEY,
    NEXT_PUBLIC_INDOBASE_URL: api,
    NEXT_PUBLIC_INDOBASE_ANON_KEY: MANAGED_PUBLIC_KEY,
    /** Hint for generated apps: name → physical collection */
    INDOBASE_COLLECTION_HINT:
      'Use `${INDOBASE_COLLECTION_PREFIX}${logicalName}` then GET/POST `${INDOBASE_RECORDS_BASE}/{physical}/records`. Auth: OTP on users collection; send Authorization: Bearer <userToken>.',
  }
}

export function buildBrandedBackend(options: {
  publicUrl: string
  appId: string
  projectName?: string
}): NonNullable<import('@indobase/platform-api').OsWorkspaceSession['backend']> {
  const api = options.publicUrl.replace(/\/+$/, '')
  const projectRef = sanitizeAppId(options.appId)
  const projectName = options.projectName || 'Indobase backend'
  const public_env = buildManagedPublicEnv({ publicUrl: api, appId: projectRef })
  return {
    anon_key: MANAGED_PUBLIC_KEY,
    api_url: api,
    auth_url: public_env.INDOBASE_AUTH_URL,
    project_name: projectName,
    project_ref: projectRef,
    project_url: api,
    rest_url: public_env.INDOBASE_REST_URL,
    storage_url: public_env.INDOBASE_STORAGE_URL,
    public_env,
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
  const appId = options?.appId?.trim()
    ? sanitizeAppId(options.appId)
    : createAppId(options?.seed)

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

/**
 * Map logical column types → PocketBase field types.
 * Prefer exact tokens; avoid substring traps (e.g. "interface" → number via "int").
 * relation/select/file need extra schema options — map those to text unless fully specified elsewhere.
 */
export function mapFieldTypeToPb(type?: string): string {
  const t = (type || 'text').trim().toLowerCase()
  const exact: Record<string, string> = {
    text: 'text',
    string: 'text',
    uuid: 'text',
    editor: 'editor',
    bool: 'bool',
    boolean: 'bool',
    number: 'number',
    int: 'number',
    integer: 'number',
    float: 'number',
    double: 'number',
    numeric: 'number',
    json: 'json',
    email: 'email',
    date: 'date',
    datetime: 'date',
    time: 'date',
    url: 'url',
    // Without collectionId/values, PB rejects relation/select/file — keep as text.
    file: 'text',
    image: 'text',
    upload: 'text',
    relation: 'text',
    ref: 'text',
    select: 'text',
    enum: 'text',
  }
  if (exact[t]) return exact[t]
  if (t === 'bool' || t.endsWith('_bool')) return 'bool'
  if (t === 'json' || t.endsWith('_json')) return 'json'
  if (t === 'email' || t.endsWith('_email')) return 'email'
  if (t === 'url' || t.endsWith('_url')) return 'url'
  if (t === 'number' || t.endsWith('_number') || t.endsWith('_count') || t.endsWith('_price')) {
    return 'number'
  }
  return 'text'
}

export async function ensureCollection(options: {
  appId: string
  name: string
  fields?: SchemaField[]
}): Promise<{ name: string; logicalName: string; id?: string; created: boolean }> {
  const { ensureCollectionSecure } = await import('./architecture.js')
  return ensureCollectionSecure({
    appId: options.appId,
    name: options.name,
    fields: options.fields,
    rules: 'owner',
  })
}
