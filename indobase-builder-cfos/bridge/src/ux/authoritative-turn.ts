/**
 * One BusinessRuntimeState per workspace for cookie session AND agent principal.
 * /api/session and begin-turn must load this the same way.
 */
import type { Session } from '../auth.js'
import { isGuestSession } from '../auth.js'
import { listCatalogCollections, listCommerceOrders, listCommerceProducts } from '../commerce/pb-adapter.js'
import type { LaunchStatusSnapshot } from '../launch-journey.js'
import { getLatestProductionLaunchJob, type ProductionLaunchJob } from '../production-launch/index.js'
import { getLaunchStatus } from '../static-launch.js'
import type { BusinessSnapshotSummary } from './agent-truth.js'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseItems(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) {
    return raw.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed)
        ? parsed.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
        : []
    } catch {
      return []
    }
  }
  return []
}

function itemsSummary(
  raw: unknown,
  products: Array<{ id?: string; name?: string; slug?: string }>,
): string | undefined {
  const items = parseItems(raw)
  if (!items.length) return undefined
  const labels = items
    .map((row) => {
      const slug = String(row.product_slug || row.slug || row.name || '').trim()
      const id = String(row.product_id || row.productId || '').trim()
      const hit = products.find((p) => p.id === id || p.slug === slug || p.name === slug)
      return (hit?.name || slug || id).trim()
    })
    .filter(Boolean)
  return labels.length ? labels.join(', ') : undefined
}

export function snapshotFromCommerceRows(
  products: Array<Record<string, unknown> | { id?: string; name?: string; priceMinor?: number; slug?: string; stock?: number; variants?: unknown }>,
  orders: Array<Record<string, unknown>>,
  collections?: Array<Record<string, unknown> | { id?: string; name?: string; slug?: string; productIds?: string[] }>,
): BusinessSnapshotSummary {
  const productRows = products.map((p) => {
    const row = asRecord(p) || (p as Record<string, unknown>)
    const variantsRaw = Array.isArray(row.variants) ? row.variants : []
    return {
      id: String(row.id || ''),
      name: String(row.name || row.id || ''),
      slug: String(row.slug || ''),
      priceMinor:
        typeof row.priceMinor === 'number'
          ? row.priceMinor
          : typeof row.price_minor === 'number'
            ? row.price_minor
            : undefined,
      stock:
        typeof row.stock === 'number'
          ? row.stock
          : typeof row.quantity === 'number'
            ? row.quantity
            : undefined,
      variants: variantsRaw
        .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
        .map((v) => ({
          id: String(v.id || ''),
          sku: typeof v.sku === 'string' ? v.sku : undefined,
          title: typeof v.title === 'string' ? v.title : undefined,
          options: v.options && typeof v.options === 'object' ? (v.options as Record<string, string>) : undefined,
          priceMinor: typeof v.priceMinor === 'number' ? v.priceMinor : undefined,
          stock: typeof v.stock === 'number' ? v.stock : undefined,
          default: v.default === true,
        })),
    }
  })
  return {
    products: productRows.map((p) => ({
      id: p.id,
      name: p.name,
      priceMinor: p.priceMinor,
      stock: p.stock,
      variants: p.variants,
    })),
    collections: (collections || []).map((c) => {
      const row = asRecord(c) || (c as Record<string, unknown>)
      return {
        id: String(row.id || ''),
        name: String(row.name || row.id || ''),
        slug: typeof row.slug === 'string' ? row.slug : undefined,
        productIds: Array.isArray(row.productIds) ? row.productIds.map((id) => String(id)) : [],
        rule: (row.rule as { category?: string; tag?: string } | null) || null,
      }
    }),
    orders: orders
      .map((o) => {
        const amount =
          typeof o.amount_minor === 'number'
            ? o.amount_minor
            : typeof o.amountMinor === 'number'
              ? o.amountMinor
              : typeof o.total === 'number'
                ? Math.round(o.total * 100)
                : undefined
        return {
          id: String(o.id || o.orderNumber || ''),
          orderNumber: String(o.orderNumber || o.id || ''),
          status: String(o.status || ''),
          payment_status: String(o.payment_status || o.paymentStatus || ''),
          fulfillment_status: String(o.fulfillment_status || o.fulfillmentStatus || 'unfulfilled'),
          amount_minor: amount,
          email: String(o.email || ''),
          customer_name: String(o.customer_name || o.customerName || ''),
          items: itemsSummary(o.items_json || o.items, productRows),
        }
      })
      .filter((o) => o.id || o.orderNumber),
    customers: orders
      .map((o) => ({
        id: String(o.customer_id || o.email || o.customer_name || ''),
        email: String(o.email || '') || undefined,
        name: String(o.customer_name || o.customerName || '') || undefined,
      }))
      .filter((c) => c.id || c.email || c.name),
  }
}

export async function loadBusinessSnapshot(
  projectRef: string,
): Promise<BusinessSnapshotSummary | null> {
  const ref = (projectRef || '').trim()
  if (!ref || ref.startsWith('draft_')) return null
  try {
    const [products, orders, collections] = await Promise.all([
      listCommerceProducts(ref),
      listCommerceOrders(ref),
      listCatalogCollections(ref).catch(() => []),
    ])
    return snapshotFromCommerceRows(products, orders, collections)
  } catch {
    return { products: [], orders: [], customers: [] }
  }
}

export type AuthoritativeLaunchFacts = {
  snapshot: BusinessSnapshotSummary | null
  launchStatus: LaunchStatusSnapshot | null
  productionJob: ProductionLaunchJob | null
}

/** Same facts `/api/session` uses — cookie session and agent principal share this. */
export async function loadAuthoritativeLaunchFacts(
  session: Session,
): Promise<AuthoritativeLaunchFacts> {
  const guest = isGuestSession(session)
  let launchStatus: LaunchStatusSnapshot | null = null
  try {
    launchStatus = await getLaunchStatus(session.projectRef)
  } catch {
    launchStatus = null
  }
  const productionJob = guest ? null : getLatestProductionLaunchJob(session.projectRef)
  const snapshot = guest ? null : await loadBusinessSnapshot(session.projectRef)
  const catalogReady = Boolean(
    productionJob?.evidence?.catalog_seeded ||
      productionJob?.evidence?.backend_ready ||
      productionJob?.status === 'live' ||
      (snapshot?.products?.length ?? 0) > 0,
  )
  if (launchStatus) {
    launchStatus = { ...launchStatus, catalogReady }
  }
  return { snapshot, launchStatus, productionJob }
}
