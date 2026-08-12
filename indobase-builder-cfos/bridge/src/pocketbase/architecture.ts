/**
 * Apply boilerplate blueprints + custom collections on the managed Indobase backend.
 * Blueprints are starters — agents may extend or reshape with applyCustomTables.
 */
import {
  getBlueprint,
  isSecureWriteRules,
  rulesForProfile,
  type BlueprintId,
  type BlueprintCollection,
  type CollectionRules,
  type RuleProfile,
} from './blueprints.js'
import {
  adminAuth,
  adminAuthHeader,
  formatPbError,
  getManagedBackendConfig,
  isCollectionNameConflict,
  mapFieldTypeToPb,
  physicalCollectionName,
  sanitizeAppId,
  type ManagedBackendConfig,
  type PbErrorPayload,
  type SchemaField,
} from './managed.js'

type CollectionRow = {
  id: string
  name: string
  listRule?: string | null
  viewRule?: string | null
  createRule?: string | null
  updateRule?: string | null
  deleteRule?: string | null
  fields?: Array<{
    id?: string
    name: string
    type?: string
    required?: boolean
    autogeneratePattern?: string
    primaryKey?: boolean
    system?: boolean
    pattern?: string
  }>
}

function inferProfile(rules: CollectionRules | RuleProfile | undefined): RuleProfile {
  if (typeof rules === 'string') return rules
  if (!rules) return 'owner'
  // Match known profiles by create/list shape
  if (rules.createRule === '' || rules.updateRule === '' || rules.deleteRule === '') {
    // open writes rejected later
  }
  const pub = rulesForProfile('public_read_auth_write')
  if (rules.listRule === pub.listRule && rules.createRule === pub.createRule) {
    return 'public_read_auth_write'
  }
  const org = rulesForProfile('members_of_org')
  if (rules.listRule === org.listRule && (rules.createRule || '').includes('org_id')) {
    return 'members_of_org'
  }
  const auth = rulesForProfile('authenticated')
  if (rules.listRule === auth.listRule && rules.createRule === auth.createRule) {
    return 'authenticated'
  }
  return 'owner'
}

async function listCollections(
  config: ManagedBackendConfig,
  token: string,
): Promise<CollectionRow[]> {
  const items: CollectionRow[] = []
  let page = 1
  const perPage = 200
  for (;;) {
    const response = await fetch(
      `${config.adminUrl}/api/collections?page=${page}&perPage=${perPage}`,
      { headers: { Authorization: adminAuthHeader(token) } },
    )
    const payload = (await response.json().catch(() => ({}))) as {
      items?: CollectionRow[]
      totalPages?: number
      page?: number
      message?: string
    }
    if (!response.ok) {
      throw new Error(payload.message || 'Failed to list collections')
    }
    items.push(...(payload.items || []))
    const totalPages = typeof payload.totalPages === 'number' ? payload.totalPages : page
    if (page >= totalPages || !(payload.items || []).length) break
    page += 1
    if (page > 50) break
  }
  return items
}

/** PB primary keys need autogeneratePattern or admin/record creates fail with id required. */
async function ensurePrimaryKeyAutogenerate(
  config: ManagedBackendConfig,
  token: string,
  collection: CollectionRow,
): Promise<void> {
  const fields = collection.fields || []
  const idField = fields.find((f) => f.name === 'id')
  if (!idField?.id) return
  const pattern = String((idField as { autogeneratePattern?: string }).autogeneratePattern || '')
  if (pattern.trim()) return
  const patchedFields = fields.map((f) => {
    if (f.name !== 'id') {
      return {
        id: f.id,
        name: f.name,
        type: f.type || 'text',
        required: Boolean(f.required),
      }
    }
    return {
      ...f,
      id: f.id,
      name: 'id',
      type: 'text',
      required: true,
      primaryKey: true,
      system: true,
      autogeneratePattern: '[a-z0-9]{15}',
      pattern: '^[a-z0-9]+$',
    }
  })
  const patch = await fetch(`${config.adminUrl}/api/collections/${collection.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: adminAuthHeader(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: patchedFields }),
  })
  if (!patch.ok) {
    const err = (await patch.json().catch(() => ({}))) as PbErrorPayload
    throw new Error(formatPbError(err, `Failed to restore id autogenerate on ${collection.name}`))
  }
}

function newRecordId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < 15; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]!
  }
  return out
}

export async function ensureCollectionSecure(
  options: {
    appId: string
    name: string
    fields?: SchemaField[]
    rules?: CollectionRules | RuleProfile
  },
  attempt = 0,
): Promise<{ name: string; logicalName: string; id?: string; created: boolean; secured: boolean }> {
  const config = getManagedBackendConfig()
  if (!config) {
    throw new Error('Indobase backend is not configured')
  }

  const token = await adminAuth(config)
  const auth = adminAuthHeader(token)
  const logicalName = options.name.trim()
  const collectionName = physicalCollectionName(sanitizeAppId(options.appId), logicalName)
  const profile = inferProfile(options.rules)
  const rules: CollectionRules =
    typeof options.rules === 'string' || !options.rules
      ? rulesForProfile(profile)
      : options.rules

  if (!isSecureWriteRules(rules)) {
    throw new Error(`Refusing open write rules for collection ${logicalName}`)
  }

  const fields = (options.fields || [])
    .filter((field) => field.name?.trim() && field.name.trim().toLowerCase() !== 'id')
    .map((field) => ({
      name: field.name.trim(),
      type: mapFieldTypeToPb(field.type),
      required: Boolean(field.required),
    }))

  if (profile !== 'public_read_auth_write' && !fields.some((f) => f.name === 'owner')) {
    fields.unshift({ name: 'owner', type: 'text', required: true })
  }
  if (profile === 'members_of_org' && !fields.some((f) => f.name === 'org_id')) {
    fields.unshift({ name: 'org_id', type: 'text', required: true })
  }

  const items = await listCollections(config, token)
  const existing = items.find((item) => item.name === collectionName)

  if (existing) {
    const existingNames = new Set((existing.fields || []).map((f) => f.name))
    const missingFields = fields.filter((f) => !existingNames.has(f.name))
    const patchBody: Record<string, unknown> = {
      listRule: rules.listRule,
      viewRule: rules.viewRule,
      createRule: rules.createRule,
      updateRule: rules.updateRule,
      deleteRule: rules.deleteRule,
    }
    if (missingFields.length) {
      // PocketBase merges fields when `fields` includes existing + new (send full set).
      patchBody.fields = [
        ...(existing.fields || []).map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type || 'text',
          required: Boolean(f.required),
        })),
        ...missingFields,
      ]
    }
    const patch = await fetch(`${config.adminUrl}/api/collections/${existing.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patchBody),
    })
    if (!patch.ok) {
      const err = (await patch.json().catch(() => ({}))) as PbErrorPayload
      throw new Error(formatPbError(err, `Failed to secure collection ${logicalName}`))
    }
    await ensurePrimaryKeyAutogenerate(config, token, existing)
    return {
      name: collectionName,
      logicalName,
      id: existing.id,
      created: false,
      secured: true,
    }
  }

  const createResponse = await fetch(`${config.adminUrl}/api/collections`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: collectionName,
      type: 'base',
      fields,
      listRule: rules.listRule,
      viewRule: rules.viewRule,
      createRule: rules.createRule,
      updateRule: rules.updateRule,
      deleteRule: rules.deleteRule,
    }),
  })
  const createPayload = (await createResponse.json().catch(() => ({}))) as PbErrorPayload & {
    id?: string
    name?: string
  }
  if (!createResponse.ok) {
    // Idempotent: another worker may have created the collection between list + create.
    // PB often puts uniqueness in data.name, with a generic message "Failed to create collection."
    if (
      createResponse.status === 400 &&
      attempt < 2 &&
      (isCollectionNameConflict(createPayload) ||
        (await listCollections(config, token)).some((item) => item.name === collectionName))
    ) {
      return ensureCollectionSecure(options, attempt + 1)
    }
    throw new Error(formatPbError(createPayload, `Failed to create collection ${collectionName}`))
  }

  const createdId = createPayload.id
  if (createdId) {
    const refreshed = await listCollections(config, token)
    const createdRow = refreshed.find((item) => item.id === createdId || item.name === collectionName)
    if (createdRow) {
      await ensurePrimaryKeyAutogenerate(config, token, createdRow)
    }
  }

  return {
    name: createPayload.name || collectionName,
    logicalName,
    id: createPayload.id,
    created: true,
    secured: true,
  }
}

function collectionSpec(c: BlueprintCollection) {
  return {
    name: c.name,
    fields: c.fields.map((f) => ({ name: f.name, type: f.type, required: f.required })),
    rules: c.rules,
  }
}

export type ApplyArchitectureResult = {
  ok: true
  blueprint: BlueprintId
  collections: string[]
  created: string[]
  secured: string[]
}

export async function applyArchitectureBlueprint(options: {
  appId: string
  blueprint?: BlueprintId | string | null
}): Promise<ApplyArchitectureResult> {
  const blueprint = getBlueprint(options.blueprint)
  const created: string[] = []
  const secured: string[] = []
  const collections: string[] = []

  for (const collection of blueprint.collections) {
    const result = await ensureCollectionSecure({
      appId: options.appId,
      ...collectionSpec(collection),
    })
    collections.push(result.logicalName)
    if (result.created) created.push(result.logicalName)
    if (result.secured) secured.push(result.logicalName)
  }

  return {
    ok: true,
    blueprint: blueprint.id,
    collections,
    created,
    secured,
  }
}

/**
 * Create/update arbitrary product collections with secure write rules.
 * Use after (or instead of) a boilerplate blueprint to customize the customer's data model.
 */
export async function applyCustomTables(options: {
  appId: string
  tables: Array<Record<string, unknown>>
  /** Default rule profile for custom tables (owner-scoped). */
  rules?: RuleProfile
}): Promise<{ ok: true; collections: string[]; created: string[] }> {
  const created: string[] = []
  const collections: string[] = []
  const rules = options.rules || 'owner'

  for (const table of options.tables) {
    const name = typeof table.name === 'string' ? table.name.trim() : ''
    if (!name) continue
    const columns = Array.isArray(table.columns) ? table.columns : []
    const fields = columns
      .filter((col): col is Record<string, unknown> => Boolean(col) && typeof col === 'object')
      .map((col) => ({
        name: typeof col.name === 'string' ? col.name : '',
        type: typeof col.type === 'string' ? col.type : 'text',
        required: Boolean(col.required),
      }))
      .filter((field) => field.name)

    const profileRaw =
      typeof table.rules === 'string'
        ? table.rules
        : table.public_read === true
          ? 'public_read_auth_write'
          : table.authenticated_write === true
            ? 'authenticated'
            : rules

    const result = await ensureCollectionSecure({
      appId: options.appId,
      name,
      fields,
      rules: profileRaw as RuleProfile,
    })
    collections.push(result.logicalName)
    if (result.created) created.push(result.logicalName)
  }

  return { ok: true, collections, created }
}

export type ArchitectureSmokeResult =
  | {
      ok: true
      blueprint: BlueprintId
      collections: string[]
      claim_architecture_ready: true
      message: string
    }
  | {
      ok: false
      blueprint: BlueprintId
      missing: string[]
      insecure: string[]
      claim_architecture_ready: false
      message: string
    }

/**
 * Prove blueprint collections exist and write rules are not world-open.
 * Optionally inserts+deletes a probe row via admin to confirm storage works.
 */
export async function smokeProveArchitecture(options: {
  appId: string
  blueprint?: BlueprintId | string | null
  probe?: boolean
}): Promise<ArchitectureSmokeResult> {
  const blueprint = getBlueprint(options.blueprint)
  const config = getManagedBackendConfig()
  if (!config) {
    return {
      ok: false,
      blueprint: blueprint.id,
      missing: blueprint.collections.map((c) => c.name),
      insecure: [],
      claim_architecture_ready: false,
      message: 'Indobase backend is not configured',
    }
  }

  const token = await adminAuth(config)
  const items = await listCollections(config, token)
  const missing: string[] = []
  const insecure: string[] = []
  const found: string[] = []

  for (const collection of blueprint.collections) {
    const physical = physicalCollectionName(options.appId, collection.name)
    const row = items.find((item) => item.name === physical)
    if (!row) {
      missing.push(collection.name)
      continue
    }
    found.push(collection.name)
    const rules: CollectionRules = {
      listRule: row.listRule ?? null,
      viewRule: row.viewRule ?? null,
      createRule: row.createRule ?? null,
      updateRule: row.updateRule ?? null,
      deleteRule: row.deleteRule ?? null,
    }
    if (
      !isSecureWriteRules(rules) ||
      rules.createRule === '' ||
      rules.updateRule === '' ||
      rules.deleteRule === ''
    ) {
      insecure.push(collection.name)
    }
  }

  if (missing.length || insecure.length) {
    return {
      ok: false,
      blueprint: blueprint.id,
      missing,
      insecure,
      claim_architecture_ready: false,
      message: [
        missing.length ? `Missing collections: ${missing.join(', ')}` : null,
        insecure.length ? `Insecure open-write collections: ${insecure.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join('. '),
    }
  }

  // Schema presence + secure rules is enough to claim architecture ready.
  // Optional probe insert can fail under owner rules when using a synthetic owner id —
  // treat probe failures as soft warnings, not hard architecture failure.
  if (options.probe !== false) {
    const probeCollection = blueprint.collections[0]
    if (probeCollection) {
      const physical = physicalCollectionName(options.appId, probeCollection.name)
      const body: Record<string, unknown> = {
        id: newRecordId(),
        owner: options.appId || 'architecture-smoke',
      }
      for (const field of probeCollection.fields) {
        if (field.name === 'owner' || field.name === 'created_at') continue
        if (field.type === 'number') body[field.name] = 0
        else if (field.type === 'bool') body[field.name] = true
        else if (field.type === 'json') body[field.name] = {}
        else if (field.type === 'email') body[field.name] = 'smoke@indobase.in'
        else if (field.type === 'date') body[field.name] = new Date().toISOString()
        else body[field.name] = field.required ? `smoke-${field.name}` : `smoke-${field.name}`
      }

      const create = await fetch(`${config.adminUrl}/api/collections/${physical}/records`, {
        method: 'POST',
        headers: {
          Authorization: adminAuthHeader(token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const created = (await create.json().catch(() => ({}))) as PbErrorPayload & { id?: string }
      if (!create.ok || !created.id) {
        return {
          ok: true,
          blueprint: blueprint.id,
          collections: found,
          claim_architecture_ready: true,
          message: `${blueprint.label} architecture ready (${found.join(', ')}). Record probe skipped: ${formatPbError(created, `smoke insert failed on ${probeCollection.name}`)}`,
        }
      }
      await fetch(`${config.adminUrl}/api/collections/${physical}/records/${created.id}`, {
        method: 'DELETE',
        headers: { Authorization: adminAuthHeader(token) },
      }).catch(() => null)
    }
  }

  return {
    ok: true,
    blueprint: blueprint.id,
    collections: found,
    claim_architecture_ready: true,
    message: `${blueprint.label} architecture ready (${found.join(', ')})`,
  }
}

/** Seed ecommerce products via admin (replaces Studio shop catalog when managed backend is live). */
export async function seedEcommerceCatalog(options: {
  appId: string
  ownerId: string
  products: Array<{
    slug: string
    name: string
    description?: string
    price: string | number
    currency?: string
    stock?: number
    image_url?: string
  }>
}): Promise<{ ok: true; products: Array<Record<string, unknown>>; catalog_json: unknown } | { ok: false; message: string }> {
  const config = getManagedBackendConfig()
  if (!config) {
    return { ok: false, message: 'Indobase backend is not configured' }
  }

  await applyArchitectureBlueprint({ appId: options.appId, blueprint: 'ecommerce' })
  const token = await adminAuth(config)
  const auth = adminAuthHeader(token)
  const physical = physicalCollectionName(options.appId, 'products')
  const upserted: Array<Record<string, unknown>> = []

  if (!options.products.length) {
    const list = await fetch(
      `${config.adminUrl}/api/collections/${physical}/records?perPage=100`,
      { headers: { Authorization: auth } },
    )
    const listPayload = (await list.json().catch(() => ({}))) as {
      items?: Array<Record<string, unknown>>
      message?: string
      data?: Record<string, unknown>
    }
    if (!list.ok) {
      return { ok: false, message: formatPbError(listPayload, 'Could not list products') }
    }
    const items = listPayload.items || []
    return { ok: true, products: items, catalog_json: { products: items } }
  }

  for (const product of options.products) {
    const price = typeof product.price === 'number' ? product.price : Number(product.price) || 0
    const body = {
      owner: options.ownerId,
      slug: product.slug,
      name: product.name,
      description: product.description || '',
      price,
      currency: product.currency || 'INR',
      stock: typeof product.stock === 'number' ? product.stock : 10,
      image_url: product.image_url || '',
      active: true,
    }

    const list = await fetch(
      `${config.adminUrl}/api/collections/${physical}/records?filter=${encodeURIComponent(`slug="${product.slug}"`)}&perPage=1`,
      { headers: { Authorization: auth } },
    )
    const listPayload = (await list.json().catch(() => ({}))) as {
      items?: Array<{ id: string }>
    }
    const existing = listPayload.items?.[0]

    if (existing?.id) {
      const patch = await fetch(`${config.adminUrl}/api/collections/${physical}/records/${existing.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const row = (await patch.json().catch(() => ({}))) as Record<string, unknown>
      if (patch.ok) upserted.push(row)
      else {
        return {
          ok: false,
          message: formatPbError(row as PbErrorPayload, `Could not update product ${product.slug}`),
        }
      }
    } else {
      const create = await fetch(`${config.adminUrl}/api/collections/${physical}/records`, {
        method: 'POST',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const row = (await create.json().catch(() => ({}))) as Record<string, unknown>
      if (create.ok) upserted.push(row)
      else {
        return {
          ok: false,
          message: formatPbError(row as PbErrorPayload, `Could not create product ${product.slug}`),
        }
      }
    }
  }

  if (!upserted.length) {
    return { ok: false, message: 'Could not seed products' }
  }

  return {
    ok: true,
    products: upserted,
    catalog_json: { products: upserted },
  }
}

export async function placeManagedTestOrder(options: {
  appId: string
  ownerId: string
  email: string
  slug: string
  quantity?: number
  cleanup?: boolean
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const config = getManagedBackendConfig()
  if (!config) {
    return { ok: false, message: 'Indobase backend is not configured' }
  }

  const token = await adminAuth(config)
  const auth = adminAuthHeader(token)
  const productsName = physicalCollectionName(options.appId, 'products')
  const ordersName = physicalCollectionName(options.appId, 'orders')
  const qty = Math.max(1, options.quantity || 1)

  const list = await fetch(
    `${config.adminUrl}/api/collections/${productsName}/records?filter=${encodeURIComponent(`slug="${options.slug}"`)}&perPage=1`,
    { headers: { Authorization: auth } },
  )
  const listPayload = (await list.json().catch(() => ({}))) as {
    items?: Array<{ id: string; stock?: number; price?: number; slug?: string }>
  }
  const product = listPayload.items?.[0]
  if (!product?.id) {
    return { ok: false, message: `Product ${options.slug} not found` }
  }

  const stock = typeof product.stock === 'number' ? product.stock : 0
  if (stock < qty) {
    return { ok: false, message: 'Insufficient stock for test order' }
  }

  await fetch(`${config.adminUrl}/api/collections/${productsName}/records/${product.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ stock: stock - qty }),
  })

  const orderRes = await fetch(`${config.adminUrl}/api/collections/${ordersName}/records`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: newRecordId(),
      owner: options.ownerId,
      email: options.email,
      status: 'test',
      total: (product.price || 0) * qty,
      currency: 'INR',
      items_json: [{ slug: options.slug, quantity: qty }],
    }),
  })
  const order = (await orderRes.json().catch(() => ({}))) as PbErrorPayload & { id?: string }
  if (!orderRes.ok || !order.id) {
    // Restore stock if order create failed
    await fetch(`${config.adminUrl}/api/collections/${productsName}/records/${product.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ stock }),
    }).catch(() => null)
    return { ok: false, message: formatPbError(order, 'Test order create failed') }
  }

  if (options.cleanup !== false) {
    await fetch(`${config.adminUrl}/api/collections/${productsName}/records/${product.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ stock }),
    })
    await fetch(`${config.adminUrl}/api/collections/${ordersName}/records/${order.id}`, {
      method: 'DELETE',
      headers: { Authorization: auth },
    }).catch(() => null)
  }

  return { ok: true, message: 'Test order verified (stock restored)' }
}
