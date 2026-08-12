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
import { majorToMinor } from './money.js'
import type { CommerceProduct, PricedLine } from './types.js'

function newId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 15)
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
  return (body.items || [])
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
    }))
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
  return {
    id: String(body.id),
    name: String(body.name || ''),
    slug: String(body.slug || ''),
    description: String(body.description || ''),
    priceMinor: majorToMinor(Number(body.price || 0), String(body.currency || 'INR')),
    currency: String(body.currency || 'INR'),
    stock: Number(body.stock || 0),
    imageUrl: String(body.image_url || ''),
    active: body.active !== false,
  }
}

export async function sumActiveReservations(
  projectRef: string,
  productId: string,
): Promise<number> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const col = physicalCollectionName(appId, 'inventory_reservations')
  const now = new Date().toISOString()
  const filter = encodeURIComponent(
    `product_id="${productId}" && status="reserved" && expires_at>"${now}"`,
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
        quantity: input.quantity,
        status: 'reserved',
        expires_at: input.expiresAt,
      }),
    },
  )
  if (!ok || !body.id) throw new Error(formatPbError(body, 'Reservation create failed'))
  return { id: body.id }
}

export async function createOrderRecord(input: {
  projectRef: string
  orderId: string
  email: string
  customerName?: string
  currency: string
  amountMinor: number
  subtotalMinor: number
  lines: PricedLine[]
  idempotencyKey: string
  reservationExpiresAt: string
  shippingAddress?: Record<string, unknown>
}): Promise<{ id: string }> {
  const appId = sanitizeAppId(input.projectRef)
  const { token, base } = await adminToken()
  const ordersCol = physicalCollectionName(appId, 'orders')
  const itemsCol = physicalCollectionName(appId, 'order_items')

  const { ok, body } = await pbJson<{ id?: string } & PbErrorPayload>(
    `${base}/api/collections/${ordersCol}/records`,
    {
      method: 'POST',
      headers: {
        Authorization: adminAuthHeader(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: input.orderId,
        owner: appId,
        email: input.email,
        customer_name: input.customerName || '',
        status: 'pending',
        payment_status: 'pending',
        total: input.amountMinor / 100, // legacy major for admin UI; amount_minor is authority
        amount_minor: input.amountMinor,
        subtotal_minor: input.subtotalMinor,
        currency: input.currency,
        idempotency_key: input.idempotencyKey,
        reservation_expires_at: input.reservationExpiresAt,
        shipping_address: input.shippingAddress || {},
        items_json: input.lines.map((l) => ({
          product_id: l.productId,
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
        order_id: input.orderId,
        product_slug: line.slug,
        product_id: line.productId,
        quantity: line.quantity,
        unit_price: line.unitPriceMinor / 100,
        unit_price_minor: line.unitPriceMinor,
      }),
    })
  }

  return { id: body.id }
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

export async function commitReservationsForOrder(
  projectRef: string,
  orderId: string,
): Promise<void> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const resCol = physicalCollectionName(appId, 'inventory_reservations')
  const productsCol = physicalCollectionName(appId, 'products')
  const filter = encodeURIComponent(`order_id="${orderId}" && status="reserved"`)
  const { ok, body } = await pbJson<{ items?: Array<Record<string, unknown>> }>(
    `${base}/api/collections/${resCol}/records?perPage=100&filter=${filter}`,
    { headers: { Authorization: adminAuthHeader(token) } },
  )
  if (!ok) return
  for (const row of body.items || []) {
    const productId = String(row.product_id || '')
    const qty = Number(row.quantity || 0)
    if (productId && qty > 0) {
      const prod = await pbJson<Record<string, unknown>>(
        `${base}/api/collections/${productsCol}/records/${encodeURIComponent(productId)}`,
        { headers: { Authorization: adminAuthHeader(token) } },
      )
      if (prod.ok) {
        const stock = Number(prod.body.stock || 0)
        await pbJson(
          `${base}/api/collections/${productsCol}/records/${encodeURIComponent(productId)}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: adminAuthHeader(token),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ stock: Math.max(0, stock - qty) }),
          },
        )
      }
    }
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

export async function releaseReservationsForOrder(
  projectRef: string,
  orderId: string,
): Promise<void> {
  const appId = sanitizeAppId(projectRef)
  const { token, base } = await adminToken()
  const resCol = physicalCollectionName(appId, 'inventory_reservations')
  const filter = encodeURIComponent(`order_id="${orderId}" && status="reserved"`)
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
  const now = new Date().toISOString()
  const filter = encodeURIComponent(`status="reserved" && expires_at<="${now}"`)
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
