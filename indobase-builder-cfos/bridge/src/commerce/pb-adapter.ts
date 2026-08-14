/**
 * PocketBase adapter for Commerce — admin/service writes only.
 * Storefront never talks to PocketBase directly for mutations.
 */
import {
  adminAuth,
  adminAuthHeader,
  formatPbError,
  getManagedBackendConfig,
  physicalCollectionName,
  sanitizeAppId,
  type PbErrorPayload,
} from '../pocketbase/managed.js'
import { applyArchitectureBlueprint } from '../pocketbase/architecture.js'
import {
  applyProductPriceToInheritedVariants,
  displayPriceMinorFromVariants,
  variantIdsInheritingProductPrice,
} from '../ux/catalog-domain.js'
import { majorToMinor, minorToMajor } from './money.js'
import type { CommerceCollection, CommerceProduct, CommerceVariant, PricedLine } from './types.js'

function newId(): string {
  // PocketBase default id pattern: ^[a-z0-9]+$ (typically 15 chars)
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  const bytes = crypto.getRandomValues(new Uint8Array(15))
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}

/**
 * PocketBase date fields and filters use `YYYY-MM-DD HH:mm:ss.SSSZ` (space, not `T`).
 * ISO-8601 `T` compares as *later* than a space, so `expires_at<="${isoT}"` releases
 * every reservation immediately.
 */
export function pocketBaseDateTime(value: Date | string = new Date()): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().replace('T', ' ')
}

/** True when a PB-stored expiry is still in the future under PB filter comparison. */
export function reservationIsActive(expiresAt: string, now: Date = new Date()): boolean {
  const exp = pocketBaseDateTime(expiresAt)
  const current = pocketBaseDateTime(now)
  return Boolean(exp && current) && exp > current
}

/**
 * ISO-8601 `T` sorts after a space, so `expires_at <= now.toISOString()` matches
 * every PB-stored future reservation. Live bug on 38e23035b.
 */
export function isoNowFalselyExpiresPbReservation(expiresAtPb: string, now: Date): boolean {
  const pbNow = pocketBaseDateTime(now)
  const isoNow = now.toISOString()
  return expiresAtPb <= isoNow && expiresAtPb > pbNow
}

export function expiredReservationFilter(now: Date = new Date()): string {
  return `status="reserved" && expires_at<="${pocketBaseDateTime(now)}"`
}

export function activeReservationFilter(productId: string, now: Date = new Date()): string {
  return `product_id="${productId}" && status="reserved" && expires_at>"${pocketBaseDateTime(now)}"`
}

export function activeVariantReservationFilter(variantId: string, now: Date = new Date()): string {
  return `variant_id="${variantId}" && status="reserved" && expires_at>"${pocketBaseDateTime(now)}"`
}

export function reservedForOrderFilter(orderId: string): string {
  return `order_id="${orderId}" && status="reserved"`
}

/** mark-paid commits stock only for rows still `reserved` (not prematurely released). */
export function markPaidCanCommitReservation(status: string): boolean {
  return status === 'reserved'
}

async function adminToken(): Promise<{ token: string; base: string }> {
  const config = getManagedBackendConfig()
  if (!config) throw new Error('Indobase backend is not configured')
  const token = await adminAuth(config)
  return { token, base: config.adminUrl.replace(/\/+$/, '') }
}

async function pbJson<T>(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: T & PbErrorPayload }> {
  const res = await fetch(url, init)
  const body = (await res.json().catch(() => ({}))) as T & PbErrorPayload
  return { ok: res.ok, status: res.status, body }
}

export async function ensureCommerceSchema(projectRef: string): Promise<void> {
  await applyArchitectureBlueprint({
    appId: sanitizeAppId(projectRef),
    blueprint: 'ecommerce',
  })
}

export async function listCommerceProducts(projectRef: string): Promise<CommerceProduct[]> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'products')
  const { ok, body } = await pbJson<{ items?: Array<Record<string, unknown>> }>(
    `${base}/api/collections/${col}/records?perPage=200&sort=-created_at`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  if (!ok) throw new Error(formatPbError(body, 'Failed to list products'))
  const products = (body.items || [])
    .filter((p) => p.active !== false)
    .map((p) => ({
      id: String(p.id || ''),
      name: String(p.name || ''),
      slug: String(p.slug || ''),
      description: String(p.description || ''),
      priceMinor: majorToMinor(Number(p.price || 0), String(p.currency || 'INR')),
      currency: String(p.currency || 'INR'),
      stock: Number(p.stock || 0),
      imageUrl: String(p.image_url || ''),
      active: p.active !== false,
      category: String(p.category || ''),
    }))
  const variants = await listVariantRecords(projectRef)
  return attachVariants(products, variants)
}

export async function getCommerceProduct(
  projectRef: string,
  productId: string,
): Promise<CommerceProduct | null> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'products')
  const { ok, body } = await pbJson<Record<string, unknown>>(
    `${base}/api/collections/${col}/records/${encodeURIComponent(productId)}`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  if (!ok || !body.id) return null
  const product = {
    id: String(body.id),
    name: String(body.name || ''),
    slug: String(body.slug || ''),
    description: String(body.description || ''),
    priceMinor: majorToMinor(Number(body.price || 0), String(body.currency || 'INR')),
    currency: String(body.currency || 'INR'),
    stock: Number(body.stock || 0),
    imageUrl: String(body.image_url || ''),
    active: body.active !== false,
    category: String(body.category || ''),
  }
  let variants = (await listVariantRecords(projectRef)).filter((row) => String(row.product_id || '') === product.id)
  if (!variants.length) {
    await createCommerceVariant(projectRef, product.id, {
      sku: product.slug || product.id,
      title: 'Default',
      options: {},
      priceMinor: product.priceMinor,
      stock: product.stock,
      currency: product.currency,
      default: true,
    })
    variants = (await listVariantRecords(projectRef)).filter((row) => String(row.product_id || '') === product.id)
  }
  return attachVariants([product], variants)[0] || product
}

function parseOptionsJson(raw: unknown): Record<string, string> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v != null) out[k] = String(v)
    }
    return out
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return parseOptionsJson(JSON.parse(raw))
    } catch {
      return {}
    }
  }
  return {}
}

function variantFromRecord(row: Record<string, unknown>, productId: string, index: number): CommerceVariant {
  return {
    id: String(row.id || ''),
    productId,
    sku: String(row.sku || ''),
    title: String(row.title || ''),
    options: parseOptionsJson(row.options_json),
    priceMinor: majorToMinor(Number(row.price || 0), String(row.currency || 'INR')),
    stock: Number(row.stock || 0),
    currency: String(row.currency || 'INR'),
    default: row.is_default === true || index === 0,
  }
}

async function listVariantRecords(
  projectRef: string,
): Promise<Array<Record<string, unknown>>> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'product_variants')
  const { ok, body } = await pbJson<{ items?: Array<Record<string, unknown>> }>(
    `${base}/api/collections/${col}/records?perPage=500`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  if (!ok) return []
  return body.items || []
}

function attachVariants(
  products: CommerceProduct[],
  rows: Array<Record<string, unknown>>,
): CommerceProduct[] {
  const byProduct = new Map<string, CommerceVariant[]>()
  for (const row of rows) {
    const productId = String(row.product_id || '')
    const list = byProduct.get(productId) || []
    list.push(variantFromRecord(row, productId, list.length))
    byProduct.set(productId, list)
  }
  return products.map((p) => {
    const variants = byProduct.get(p.id) || []
    const attached = variants.map((v, i) => ({ ...v, default: v.default || i === 0 }))
    const stock = attached.length ? attached.reduce((s, v) => s + v.stock, 0) : p.stock
    const priceMinor = displayPriceMinorFromVariants(attached, p.priceMinor) ?? p.priceMinor
    return { ...p, variants: attached, stock, priceMinor }
  })
}

function productFromRecord(row: Record<string, unknown>): CommerceProduct {
  return {
    id: String(row.id || ''),
    name: String(row.name || ''),
    slug: String(row.slug || ''),
    description: String(row.description || ''),
    priceMinor: majorToMinor(Number(row.price || 0), String(row.currency || 'INR')),
    currency: String(row.currency || 'INR'),
    stock: Number(row.stock || 0),
    imageUrl: String(row.image_url || ''),
    active: row.active !== false,
    category: String(row.category || ''),
  }
}

export async function createCommerceProduct(
  projectRef: string,
  input: {
    name: string
    slug?: string
    description?: string
    priceMinor: number
    currency?: string
    stock?: number
    category?: string
    variants?: Array<{ sku: string; title: string; options: Record<string, string>; priceMinor: number; stock: number }>
  },
): Promise<CommerceProduct> {
  const appId = sanitizeAppId(projectRef)
  await ensureCommerceSchema(projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'products')
  const currency = input.currency || 'INR'
  const slug =
    (input.slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `p-${newId().slice(0, 10)}`
  const { ok, body } = await pbJson<Record<string, unknown>>(
    `${base}/api/collections/${col}/records`,
    {
      method: 'POST',
      headers: {
        Authorization: adminAuthHeader(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: newId(),
        owner: appId,
        slug,
        name: input.name,
        description: input.description || '',
        price: minorToMajor(input.priceMinor, currency),
        currency,
        stock: typeof input.stock === 'number' ? input.stock : 10,
        image_url: '',
        active: true,
        category: input.category || '',
      }),
    },
  )
  if (!ok || !body.id) throw new Error(formatPbError(body, 'Could not create product'))
  let product = productFromRecord(body)
  const variantSpecs = input.variants?.length
    ? input.variants
    : [
        {
          sku: slug,
          title: 'Default',
          options: {},
          priceMinor: input.priceMinor,
          stock: typeof input.stock === 'number' ? input.stock : 10,
        },
      ]
  for (let i = 0; i < variantSpecs.length; i++) {
    await createCommerceVariant(projectRef, product.id, { ...variantSpecs[i], default: i === 0 })
  }
  const loaded = await getCommerceProduct(projectRef, product.id)
  if (loaded) product = loaded
  return product
}

export async function patchCommerceProduct(
  projectRef: string,
  productId: string,
  patch: { name?: string; priceMinor?: number; stock?: number; description?: string; currency?: string },
): Promise<CommerceProduct | null> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'products')
  const current = typeof patch.priceMinor === 'number' ? await getCommerceProduct(projectRef, productId) : null
  if (typeof patch.priceMinor === 'number' && current?.variants?.length) {
    const next = applyProductPriceToInheritedVariants(
      {
        priceMinor: current.priceMinor,
        variants: current.variants.map((v) => ({
          id: v.id,
          priceMinor: v.priceMinor,
          default: v.default,
        })),
      },
      patch.priceMinor,
    )
    for (const id of variantIdsInheritingProductPrice(current)) {
      await patchCommerceVariant(projectRef, id, { priceMinor: patch.priceMinor, currency: patch.currency })
    }
    patch = { ...patch, priceMinor: next.priceMinor ?? patch.priceMinor }
  }
  const body: Record<string, unknown> = {}
  if (typeof patch.name === 'string') body.name = patch.name
  if (typeof patch.description === 'string') body.description = patch.description
  if (typeof patch.stock === 'number') body.stock = Math.max(0, Math.round(patch.stock))
  if (typeof patch.priceMinor === 'number') {
    const currency = patch.currency || 'INR'
    body.price = minorToMajor(patch.priceMinor, currency)
    if (patch.currency) body.currency = patch.currency
  }
  const { ok, body: row } = await pbJson<Record<string, unknown>>(
    `${base}/api/collections/${col}/records/${encodeURIComponent(productId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: adminAuthHeader(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )
  if (!ok || !row.id) return null
  const loaded = await getCommerceProduct(projectRef, String(row.id))
  return loaded
}

export async function createCommerceVariant(
  projectRef: string,
  productId: string,
  input: {
    sku: string
    title: string
    options: Record<string, string>
    priceMinor: number
    stock: number
    currency?: string
    default?: boolean
  },
): Promise<CommerceVariant | null> {
  const appId = sanitizeAppId(projectRef)
  await ensureCommerceSchema(projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'product_variants')
  const currency = input.currency || 'INR'
  const { ok, body } = await pbJson<Record<string, unknown>>(
    `${base}/api/collections/${col}/records`,
    {
      method: 'POST',
      headers: {
        Authorization: adminAuthHeader(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: newId(),
        owner: appId,
        product_id: productId,
        sku: input.sku,
        title: input.title,
        price: minorToMajor(input.priceMinor, currency),
        currency,
        stock: input.stock,
        options_json: input.options || {},
        is_default: Boolean(input.default),
        active: true,
      }),
    },
  )
  if (!ok || !body.id) throw new Error(formatPbError(body, 'Could not create variant'))
  return variantFromRecord(body, productId, 0)
}

export async function patchCommerceVariant(
  projectRef: string,
  variantId: string,
  patch: { stock?: number; priceMinor?: number; currency?: string },
): Promise<CommerceVariant | null> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'product_variants')
  const body: Record<string, unknown> = {}
  if (typeof patch.stock === 'number') body.stock = Math.max(0, Math.round(patch.stock))
  if (typeof patch.priceMinor === 'number') {
    const currency = patch.currency || 'INR'
    body.price = minorToMajor(patch.priceMinor, currency)
  }
  const { ok, body: row } = await pbJson<Record<string, unknown>>(
    `${base}/api/collections/${col}/records/${encodeURIComponent(variantId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: adminAuthHeader(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )
  if (!ok || !row.id) return null
  return variantFromRecord(row, String(row.product_id || ''), 0)
}

function collectionFromRecords(
  row: Record<string, unknown>,
  members: Array<Record<string, unknown>>,
): CommerceCollection {
  const id = String(row.id || '')
  const ruleRaw = row.rule_json
  let rule: CommerceCollection['rule'] = null
  if (ruleRaw && typeof ruleRaw === 'object') {
    const rec = ruleRaw as Record<string, unknown>
    rule = {
      category: rec.category ? String(rec.category) : undefined,
      tag: rec.tag ? String(rec.tag) : undefined,
    }
  }
  return {
    id,
    name: String(row.name || ''),
    slug: String(row.slug || ''),
    productIds: members.filter((m) => String(m.collection_id || '') === id).map((m) => String(m.product_id || '')),
    rule,
  }
}

export async function listCatalogCollections(projectRef: string): Promise<CommerceCollection[]> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'catalog_collections')
  const membersCol = physicalCollectionName(appId, 'catalog_collection_products')
  const { ok, body } = await pbJson<{ items?: Array<Record<string, unknown>> }>(
    `${base}/api/collections/${col}/records?perPage=200&sort=-created_at`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  if (!ok) return []
  const members = await pbJson<{ items?: Array<Record<string, unknown>> }>(
    `${base}/api/collections/${membersCol}/records?perPage=500`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  const memberRows = members.ok ? members.body.items || [] : []
  let products: CommerceProduct[] = []
  try {
    products = await listCommerceProducts(projectRef)
  } catch {
    products = []
  }
  return (body.items || []).map((row) => {
    const collection = collectionFromRecords(row, memberRows)
    const rule = collection.rule
    if (rule?.category) {
      const extra = products.filter((p) => (p.category || '').toLowerCase() === rule.category!.toLowerCase()).map((p) => p.id)
      collection.productIds = [...new Set([...collection.productIds, ...extra])]
    }
    return collection
  })
}

export async function createCatalogCollection(
  projectRef: string,
  input: { name: string; slug?: string; rule?: { category?: string; tag?: string } | null },
): Promise<CommerceCollection> {
  const appId = sanitizeAppId(projectRef)
  await ensureCommerceSchema(projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'catalog_collections')
  const slug =
    (input.slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `c-${newId().slice(0, 10)}`
  const { ok, body } = await pbJson<Record<string, unknown>>(
    `${base}/api/collections/${col}/records`,
    {
      method: 'POST',
      headers: {
        Authorization: adminAuthHeader(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: newId(),
        owner: appId,
        name: input.name,
        slug,
        rule_json: input.rule || {},
      }),
    },
  )
  if (!ok || !body.id) throw new Error(formatPbError(body, 'Could not create collection'))
  return collectionFromRecords(body, [])
}

export async function assignCatalogCollectionProduct(
  projectRef: string,
  collectionId: string,
  productId: string,
): Promise<CommerceCollection | null> {
  const appId = sanitizeAppId(projectRef)
  await ensureCommerceSchema(projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'catalog_collection_products')
  await pbJson(`${base}/api/collections/${col}/records`, {
    method: 'POST',
    headers: {
      Authorization: adminAuthHeader(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: newId(),
      owner: appId,
      collection_id: collectionId,
      product_id: productId,
    }),
  })
  const all = await listCatalogCollections(projectRef)
  return all.find((c) => c.id === collectionId) || null
}

export async function sumActiveReservations(
  projectRef: string,
  productId: string,
  variantId?: string,
): Promise<number> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'inventory_reservations')
  const filter = encodeURIComponent(
    variantId
      ? activeVariantReservationFilter(variantId)
      : activeReservationFilter(productId),
  )
  const { ok, body } = await pbJson<{ items?: Array<{ quantity?: number }> }>(
    `${base}/api/collections/${col}/records?perPage=200&filter=${filter}`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  if (!ok) return 0
  return (body.items || []).reduce((s, r) => s + Number(r.quantity || 0), 0)
}

export async function findOrderByIdempotencyKey(
  projectRef: string,
  idempotencyKey: string,
): Promise<{ id: string; payment_status?: string; total?: number; currency?: string; payment_url?: string } | null> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'orders')
  const filter = encodeURIComponent(`idempotency_key="${idempotencyKey.replace(/"/g, '')}"`)
  const { ok, body } = await pbJson<{ items?: Array<Record<string, unknown>> }>(
    `${base}/api/collections/${col}/records?perPage=1&filter=${filter}`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  if (!ok || !body.items?.length) return null
  const row = body.items[0]
  return {
    id: String(row.id),
    payment_status: typeof row.payment_status === 'string' ? row.payment_status : undefined,
    total: typeof row.total === 'number' ? row.total : undefined,
    currency: typeof row.currency === 'string' ? row.currency : undefined,
    payment_url: typeof row.payment_url === 'string' ? row.payment_url : undefined,
  }
}

export async function createReservation(input: {
  projectRef: string
  orderId: string
  productId: string
  variantId?: string
  quantity: number
  expiresAt: string
}): Promise<{ id: string }> {
  const appId = sanitizeAppId(input.projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'inventory_reservations')
  const id = newId()
  const { ok, body } = await pbJson<{ id?: string } & PbErrorPayload>(
    `${base}/api/collections/${col}/records`,
    {
      method: 'POST',
      headers: {
        Authorization: adminAuthHeader(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id,
        owner: appId,
        order_id: input.orderId,
        product_id: input.productId,
        variant_id: input.variantId || '',
        quantity: input.quantity,
        status: 'reserved',
        expires_at: pocketBaseDateTime(input.expiresAt),
        created_at: pocketBaseDateTime(),
      }),
    },
  )
  if (!ok || !body.id) throw new Error(formatPbError(body, 'Reservation create failed'))
  return { id: body.id }
}

export async function createOrderRecord(input: {
  projectRef: string
  orderId?: string
  email: string
  customerName?: string
  currency: string
  amountMinor: number
  subtotalMinor: number
  lines: PricedLine[]
  idempotencyKey: string
  reservationExpiresAt: string
  shippingAddress?: Record<string, unknown>
  customerId?: string
  customerType?: 'guest' | 'registered'
  guestTokenHash?: string | null
}): Promise<{ id: string }> {
  const appId = sanitizeAppId(input.projectRef)
  const { token, base } = await adminToken()
  const ordersCol = physicalCollectionName(appId, 'orders')
  const itemsCol = physicalCollectionName(appId, 'order_items')
  const orderId = input.orderId || newId()

  const { ok, body } = await pbJson<{ id?: string } & PbErrorPayload>(
    `${base}/api/collections/${ordersCol}/records`,
    {
      method: 'POST',
      headers: {
        Authorization: adminAuthHeader(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: orderId,
        owner: appId,
        email: input.email,
        customer_name: input.customerName || '',
        status: 'pending',
        payment_status: 'pending',
        fulfillment_status: 'unfulfilled',
        total: input.amountMinor / 100,
        amount_minor: input.amountMinor,
        subtotal_minor: input.subtotalMinor,
        currency: input.currency,
        idempotency_key: input.idempotencyKey,
        reservation_expires_at: pocketBaseDateTime(input.reservationExpiresAt),
        shipping_address: input.shippingAddress || {},
        created_at: pocketBaseDateTime(),
        customer_id: input.customerId || '',
        customer_type: input.customerType || '',
        guest_token_hash: input.guestTokenHash || '',
        items_json: input.lines.map((l) => ({
          product_id: l.productId,
          variant_id: l.variantId,
          product_slug: l.slug,
          quantity: l.quantity,
          unit_price_minor: l.unitPriceMinor,
          line_total_minor: l.lineTotalMinor,
        })),
      }),
    },
  )
  if (!ok || !body.id) throw new Error(formatPbError(body, 'Order create failed'))

  for (const line of input.lines) {
    await pbJson(`${base}/api/collections/${itemsCol}/records`, {
      method: 'POST',
      headers: {
        Authorization: adminAuthHeader(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: newId(),
        owner: appId,
        order_id: body.id,
        product_slug: line.slug,
        product_id: line.productId,
        variant_id: line.variantId,
        quantity: line.quantity,
        unit_price: line.unitPriceMinor / 100,
        unit_price_minor: line.unitPriceMinor,
        created_at: pocketBaseDateTime(),
      }),
    })
  }

  return { id: String(body.id) }
}

export async function patchOrderPayment(
  projectRef: string,
  orderId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'orders')
  await pbJson(`${base}/api/collections/${col}/records/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: adminAuthHeader(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  })
}

export async function getOrderRecord(
  projectRef: string,
  orderId: string,
): Promise<Record<string, unknown> | null> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'orders')
  const { ok, body } = await pbJson<Record<string, unknown>>(
    `${base}/api/collections/${col}/records/${encodeURIComponent(orderId)}`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  if (!ok || !body.id) return null
  return body
}

async function decrementVariantStock(
  base: string,
  token: string,
  variantsCol: string,
  variantId: string,
  qty: number,
): Promise<void> {
  if (!variantId || qty <= 0) return
  const row = await pbJson<Record<string, unknown>>(
    `${base}/api/collections/${variantsCol}/records/${encodeURIComponent(variantId)}`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  if (!row.ok) return
  const stock = Number(row.body.stock || 0)
  await pbJson(`${base}/api/collections/${variantsCol}/records/${encodeURIComponent(variantId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: adminAuthHeader(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ stock: Math.max(0, stock - qty) }),
  })
}

function linesFromOrder(order: Record<string, unknown>): Array<{ productId: string; variantId?: string; quantity: number }> {
  const raw = order.items_json
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      return {
        productId: String(item.product_id || item.productId || ''),
        variantId: String(item.variant_id || item.variantId || '') || undefined,
        quantity: Number(item.quantity || 0),
      }
    })
    .filter((l) => l.productId && l.quantity > 0)
}

export async function commitReservationsForOrder(
  projectRef: string,
  orderId: string,
): Promise<void> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const resCol = physicalCollectionName(appId, 'inventory_reservations')
  const variantsCol = physicalCollectionName(appId, 'product_variants')
  const filter = encodeURIComponent(reservedForOrderFilter(orderId))
  const { ok, body } = await pbJson<{ items?: Array<Record<string, unknown>> }>(
    `${base}/api/collections/${resCol}/records?perPage=100&filter=${filter}`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  const reserved = ok ? body.items || [] : []
  if (reserved.length) {
    for (const row of reserved) {
      const variantId = String(row.variant_id || '')
      if (variantId) {
        await decrementVariantStock(base, token, variantsCol, variantId, Number(row.quantity || 0))
      }
      if (row.id) {
        await pbJson(`${base}/api/collections/${resCol}/records/${encodeURIComponent(String(row.id))}`, {
          method: 'PATCH',
          headers: {
            Authorization: adminAuthHeader(token),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'committed' }),
        })
      }
    }
    return
  }

  // Date-filter bugs (or expiry) may have released rows before webhook. Still commit stock once.
  const order = await getOrderRecord(projectRef, orderId)
  if (!order) return
  for (const line of linesFromOrder(order)) {
    if (line.variantId) {
      await decrementVariantStock(base, token, variantsCol, line.variantId, line.quantity)
    }
  }
  const anyFilter = encodeURIComponent(`order_id="${orderId}"`)
  const leftover = await pbJson<{ items?: Array<{ id?: string; status?: string }> }>(
    `${base}/api/collections/${resCol}/records?perPage=100&filter=${anyFilter}`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  for (const row of leftover.body.items || []) {
    if (!row.id || row.status === 'committed') continue
    await pbJson(`${base}/api/collections/${resCol}/records/${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      headers: {
        Authorization: adminAuthHeader(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'committed' }),
    })
  }
}

export async function releaseReservationsForOrder(
  projectRef: string,
  orderId: string,
): Promise<void> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const resCol = physicalCollectionName(appId, 'inventory_reservations')
  const filter = encodeURIComponent(reservedForOrderFilter(orderId))
  const { ok, body } = await pbJson<{ items?: Array<{ id?: string }> }>(
    `${base}/api/collections/${resCol}/records?perPage=100&filter=${filter}`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  if (!ok) return
  for (const row of body.items || []) {
    if (!row.id) continue
    await pbJson(`${base}/api/collections/${resCol}/records/${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      headers: {
        Authorization: adminAuthHeader(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'released' }),
    })
  }
}

/** Lazy expiry: mark expired reservations released. */
export async function releaseExpiredReservations(projectRef: string): Promise<number> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const resCol = physicalCollectionName(appId, 'inventory_reservations')
  const filter = encodeURIComponent(expiredReservationFilter())
  const { ok, body } = await pbJson<{ items?: Array<{ id?: string }> }>(
    `${base}/api/collections/${resCol}/records?perPage=100&filter=${filter}`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  if (!ok) return 0
  let n = 0
  for (const row of body.items || []) {
    if (!row.id) continue
    await pbJson(`${base}/api/collections/${resCol}/records/${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      headers: {
        Authorization: adminAuthHeader(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'released' }),
    })
    n += 1
  }
  return n
}

export async function listCommerceOrders(
  projectRef: string,
): Promise<Array<Record<string, unknown>>> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'orders')
  const { ok, body } = await pbJson<{ items?: Array<Record<string, unknown>> }>(
    `${base}/api/collections/${col}/records?perPage=50`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  if (!ok) throw new Error(formatPbError(body, 'Failed to list orders'))
  return [...(body.items || [])].reverse()
}
