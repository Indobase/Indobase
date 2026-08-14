/**
 * PocketBase BusinessDataAdapter — agent-facing products/orders/customers.
 * Never expose collection HTTP to chat or Control Center callers.
 */
import type {
  BusinessCustomer,
  BusinessDataAdapter,
  BusinessDataSnapshot,
  BusinessOrder,
  BusinessProduct,
} from '@indobase/platform'

import { listManagedShopSnapshot } from './architecture.js'

function parseCreatedAt(raw?: string | null): string | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const trimmed = raw.trim()
  const normalized = /^\d{4}-\d{2}-\d{2} /.test(trimmed) ? trimmed.replace(' ', 'T') : trimmed
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function mapProduct(row: Record<string, unknown>): BusinessProduct {
  const variantsRaw = Array.isArray(row.variants)
    ? row.variants
    : Array.isArray(row.variants_json)
      ? row.variants_json
      : []
  const variants = variantsRaw
    .map((v) => {
      const rec = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
      if (!rec) return null
      return {
        id: asString(rec.id) || '',
        sku: asString(rec.sku),
        title: asString(rec.title),
        priceMinor: asNumber(rec.price_minor) ?? asNumber(rec.priceMinor),
        stock: asNumber(rec.stock),
        default: rec.default === true || rec.is_default === true,
      }
    })
    .filter((v): v is NonNullable<typeof v> => Boolean(v?.id))
  return {
    id: asString(row.id) || '',
    name: asString(row.name) || asString(row.title) || asString(row.id) || '',
    priceMinor: asNumber(row.price_minor) ?? asNumber(row.priceMinor),
    sku: asString(row.sku),
    status: asString(row.status),
    stock: asNumber(row.stock),
    variants: variants.length ? variants : undefined,
  }
}

function mapOrder(row: Record<string, unknown>): BusinessOrder {
  return {
    id: asString(row.id) || '',
    orderNumber: asString(row.order_number) || asString(row.orderNumber) || asString(row.id),
    status: asString(row.status),
    paymentStatus: asString(row.payment_status) || asString(row.paymentStatus),
    fulfillmentStatus: asString(row.fulfillment_status) || asString(row.fulfillmentStatus),
    amountMinor: asNumber(row.amount_minor) ?? asNumber(row.amountMinor),
    email: asString(row.email) || asString(row.customer_email),
    createdAt: parseCreatedAt(
      asString(row.createdAt) || asString(row.created_at) || asString(row.created),
    ),
  }
}

function mapCustomer(row: Record<string, unknown>): BusinessCustomer {
  return {
    id: asString(row.id) || asString(row.email) || '',
    email: asString(row.email),
    name: asString(row.name),
  }
}

async function loadSnapshot(businessRef: string): Promise<BusinessDataSnapshot> {
  const raw = await listManagedShopSnapshot({ appId: businessRef })
  if (!raw.ok) {
    return { products: [], customers: [], orders: [] }
  }
  const products = raw.products.map(mapProduct).filter((p) => p.id)
  const orders = raw.orders.map(mapOrder).filter((o) => o.id)
  const customersById = new Map<string, BusinessCustomer>()
  for (const order of raw.orders) {
    const customer = mapCustomer(order)
    if (customer.id && !customersById.has(customer.id)) {
      customersById.set(customer.id, customer)
    }
  }
  return {
    products,
    customers: [...customersById.values()],
    orders,
  }
}

export const pocketBaseBusinessDataAdapter: BusinessDataAdapter = {
  async listProducts(businessRef) {
    return (await loadSnapshot(businessRef)).products
  },
  async listCustomers(businessRef) {
    return (await loadSnapshot(businessRef)).customers
  },
  async listOrders(businessRef) {
    return (await loadSnapshot(businessRef)).orders
  },
  snapshot: loadSnapshot,
}
