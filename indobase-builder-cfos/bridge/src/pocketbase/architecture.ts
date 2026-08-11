/**
 * Apply locked blueprints + smoke-prove architecture on the managed Indobase backend.
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
  getManagedBackendConfig,
  physicalCollectionName,
  type ManagedBackendConfig,
  type SchemaField,
} from './managed.js'

function mapFieldType(type?: string): string {
  const t = (type || 'text').toLowerCase()
  if (t.includes('bool')) return 'bool'
  if (t.includes('int') || t.includes('numeric') || t.includes('float') || t.includes('number')) {
    return 'number'
  }
  if (t.includes('json')) return 'json'
  if (t.includes('email')) return 'email'
  if (t.includes('date') || t.includes('time')) return 'date'
  if (t.includes('url') || t.includes('file')) return 'url'
  return 'text'
}

async function listCollections(
  config: ManagedBackendConfig,
  token: string,
): Promise<Array<{ id: string; name: string; listRule?: string | null; viewRule?: string | null; createRule?: string | null; updateRule?: string | null; deleteRule?: string | null; fields?: Array<{ name: string }> }>> {
  const response = await fetch(`${config.adminUrl}/api/collections?page=1&perPage=200`, {
    headers: { Authorization: token },
  })
  const payload = (await response.json().catch(() => ({}))) as {
    items?: Array<{
      id: string
      name: string
      listRule?: string | null
      viewRule?: string | null
      createRule?: string | null
      updateRule?: string | null
      deleteRule?: string | null
      fields?: Array<{ name: string }>
    }>
    message?: string
  }
  if (!response.ok) {
    throw new Error(payload.message || 'Failed to list collections')
  }
  return payload.items || []
}

export async function ensureCollectionSecure(options: {
  appId: string
  name: string
  fields?: SchemaField[]
  rules?: CollectionRules | RuleProfile
}): Promise<{ name: string; logicalName: string; id?: string; created: boolean; secured: boolean }> {
  const config = getManagedBackendConfig()
  if (!config) {
    throw new Error('Indobase backend is not configured')
  }

  const token = await adminAuth(config)
  const logicalName = options.name.trim()
  const collectionName = physicalCollectionName(options.appId, logicalName)
  const rules: CollectionRules =
    typeof options.rules === 'string' || !options.rules
      ? rulesForProfile((options.rules as RuleProfile) || 'owner')
      : options.rules

  if (!isSecureWriteRules(rules) && rules.createRule !== '') {
    // public_read_auth_write has empty list but auth-gated writes — still OK
  }
  if (isSecureWriteRules(rules) === false && rules.createRule === '') {
    throw new Error(`Refusing open write rules for collection ${logicalName}`)
  }
  // Allow public_read_auth_write (empty list/view, auth create)
  if (rules.createRule === '' || rules.updateRule === '' || rules.deleteRule === '') {
    throw new Error(`Refusing open write rules for collection ${logicalName}`)
  }

  const fields = (options.fields || [])
    .filter((field) => field.name?.trim() && field.name.trim().toLowerCase() !== 'id')
    .map((field) => ({
      name: field.name.trim(),
      type: mapFieldType(field.type),
      required: Boolean(field.required),
    }))

  // Always ensure owner on owner-scoped collections
  const profile: RuleProfile =
    typeof options.rules === 'string' ? options.rules : options.rules ? 'owner' : 'owner'
  if (profile !== 'public_read_auth_write' && !fields.some((f) => f.name === 'owner')) {
    fields.unshift({ name: 'owner', type: 'text', required: true })
  }

  const items = await listCollections(config, token)
  const existing = items.find((item) => item.name === collectionName)

  if (existing) {
    const patch = await fetch(`${config.adminUrl}/api/collections/${existing.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        listRule: rules.listRule,
        viewRule: rules.viewRule,
        createRule: rules.createRule,
        updateRule: rules.updateRule,
        deleteRule: rules.deleteRule,
      }),
    })
    if (!patch.ok) {
      const err = (await patch.json().catch(() => ({}))) as { message?: string }
      throw new Error(err.message || `Failed to secure collection ${logicalName}`)
    }
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
      Authorization: token,
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
    if (rules.createRule === '' || rules.updateRule === '' || rules.deleteRule === '') {
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

  if (options.probe !== false) {
    const probeCollection = blueprint.collections[0]
    if (probeCollection) {
      const physical = physicalCollectionName(options.appId, probeCollection.name)
      const body: Record<string, unknown> = {
        owner: 'architecture-smoke',
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
          Authorization: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const created = (await create.json().catch(() => ({}))) as { id?: string; message?: string }
      if (!create.ok || !created.id) {
        return {
          ok: false,
          blueprint: blueprint.id,
          missing: [],
          insecure: [],
          claim_architecture_ready: false,
          message: created.message || `Smoke insert failed on ${probeCollection.name}`,
        }
      }
      await fetch(`${config.adminUrl}/api/collections/${physical}/records/${created.id}`, {
        method: 'DELETE',
        headers: { Authorization: token },
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
  const physical = physicalCollectionName(options.appId, 'products')
  const upserted: Array<Record<string, unknown>> = []

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
      { headers: { Authorization: token } },
    )
    const listPayload = (await list.json().catch(() => ({}))) as {
      items?: Array<{ id: string }>
    }
    const existing = listPayload.items?.[0]

    if (existing?.id) {
      const patch = await fetch(`${config.adminUrl}/api/collections/${physical}/records/${existing.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const row = (await patch.json().catch(() => ({}))) as Record<string, unknown>
      if (patch.ok) upserted.push(row)
    } else {
      const create = await fetch(`${config.adminUrl}/api/collections/${physical}/records`, {
        method: 'POST',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const row = (await create.json().catch(() => ({}))) as Record<string, unknown>
      if (create.ok) upserted.push(row)
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
  const productsName = physicalCollectionName(options.appId, 'products')
  const ordersName = physicalCollectionName(options.appId, 'orders')
  const qty = Math.max(1, options.quantity || 1)

  const list = await fetch(
    `${config.adminUrl}/api/collections/${productsName}/records?filter=${encodeURIComponent(`slug="${options.slug}"`)}&perPage=1`,
    { headers: { Authorization: token } },
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
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ stock: stock - qty }),
  })

  const orderRes = await fetch(`${config.adminUrl}/api/collections/${ordersName}/records`, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      owner: options.ownerId,
      email: options.email,
      status: 'test',
      total: (product.price || 0) * qty,
      currency: 'INR',
      items_json: [{ slug: options.slug, quantity: qty }],
    }),
  })
  const order = (await orderRes.json().catch(() => ({}))) as { id?: string; message?: string }
  if (!orderRes.ok || !order.id) {
    return { ok: false, message: order.message || 'Test order create failed' }
  }

  if (options.cleanup !== false) {
    await fetch(`${config.adminUrl}/api/collections/${productsName}/records/${product.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ stock }),
    })
    await fetch(`${config.adminUrl}/api/collections/${ordersName}/records/${order.id}`, {
      method: 'DELETE',
      headers: { Authorization: token },
    }).catch(() => null)
  }

  return { ok: true, message: 'Test order verified (stock restored)' }
}
