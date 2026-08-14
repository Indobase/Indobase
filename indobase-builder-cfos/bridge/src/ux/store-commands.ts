/**
 * Internal store commands — MODIFY/OPERATE skills, not agent tools.
 * Session projectRef is authority. PocketBase stays an implementation detail.
 */

import { createCommand, type Command } from '@indobase/platform'
import { authorizeControlCenterAccess } from '../commerce/control-center-auth.js'
import {
  cancelOpenOrder,
  markOrderFailed,
  markOrderFulfillment,
  markOrderPaid,
} from '../commerce/checkout-service.js'
import { majorToMinor } from '../commerce/money.js'
import {
  assignCatalogCollectionProduct,
  createCatalogCollection,
  createCommerceProduct,
  createCommerceVariant,
  listCatalogCollections,
  listCommerceOrders,
  listCommerceProducts,
  patchCommerceProduct,
  patchCommerceVariant,
  type CommerceCollection,
  type CommerceProduct,
  type CommerceVariant,
} from '../commerce/pb-adapter.js'
import { snapshotFromCommerceRows, type BusinessSnapshotSummary } from './authoritative-turn.js'
import {
  parseCollectionName,
  parseProductOptions,
  parseSizeValues,
  productNameFromCreateIntent,
  variantRowsFromOptions,
} from './catalog-domain.js'

export type StoreCommandKind =
  | 'product.create'
  | 'product.update'
  | 'variant.create'
  | 'inventory.update'
  | 'collection.create'
  | 'collection.assign'
  | 'order.status'
  | 'order.fulfill'
  | 'orders.query'
  | 'catalog.query'

export type StoreVariantRecord = {
  id: string
  sku?: string
  title?: string
  options?: Record<string, string>
  priceMinor?: number
  stock?: number
  default?: boolean
}

export type StoreCollectionRecord = {
  id: string
  name: string
  slug?: string
  productIds: string[]
  rule?: { category?: string; tag?: string } | null
}

export type ClassifiedStoreCommand = {
  kind: StoreCommandKind
  readOnly: boolean
  name?: string
  description?: string
  priceMajor?: number
  stock?: number
  percent?: number
  productHint?: string
  variantHint?: string
  collectionHint?: string
  options?: Record<string, string[]>
  orderHint?: string
  orderStatus?: 'paid' | 'failed' | 'cancelled'
  fulfillmentStatus?: 'processing' | 'fulfilled' | 'cancelled'
  query?: 'low-stock' | 'catalog' | 'orders' | 'collections'
}

export type StoreProductRecord = {
  id: string
  name: string
  slug?: string
  priceMinor: number
  stock: number
  currency?: string
  category?: string
  variants?: StoreVariantRecord[]
}

export type StoreCommandDeps = {
  listProducts: (projectRef: string) => Promise<StoreProductRecord[]>
  createProduct: (
    projectRef: string,
    input: {
      name: string
      slug?: string
      description?: string
      priceMinor: number
      stock: number
      options?: Record<string, string[]>
      variants?: Array<{ sku: string; title: string; options: Record<string, string>; priceMinor: number; stock: number }>
    },
  ) => Promise<StoreProductRecord>
  updateProduct: (
    projectRef: string,
    productId: string,
    patch: { name?: string; priceMinor?: number; stock?: number },
  ) => Promise<StoreProductRecord | null>
  createVariant?: (
    projectRef: string,
    productId: string,
    input: { sku: string; title: string; options: Record<string, string>; priceMinor: number; stock: number },
  ) => Promise<StoreVariantRecord | null>
  updateVariant?: (
    projectRef: string,
    variantId: string,
    patch: { stock?: number; priceMinor?: number },
  ) => Promise<StoreVariantRecord | null>
  listCollections?: (projectRef: string) => Promise<StoreCollectionRecord[]>
  createCollection?: (
    projectRef: string,
    input: { name: string; slug?: string; rule?: { category?: string; tag?: string } | null },
  ) => Promise<StoreCollectionRecord>
  assignCollectionProduct?: (
    projectRef: string,
    collectionId: string,
    productId: string,
  ) => Promise<StoreCollectionRecord | null>
  listOrders?: (projectRef: string) => Promise<Array<Record<string, unknown>>>
  updateOrderStatus?: (
    projectRef: string,
    orderId: string,
    status: 'paid' | 'failed' | 'cancelled',
  ) => Promise<{ ok: boolean; message?: string; paymentStatus?: string; fulfillmentStatus?: string }>
  updateOrderFulfillment?: (
    projectRef: string,
    orderId: string,
    fulfillmentStatus: 'processing' | 'fulfilled' | 'cancelled',
  ) => Promise<{ ok: boolean; message?: string; paymentStatus?: string; fulfillmentStatus?: string }>
}

export type StoreCommandResult = {
  ok: boolean
  status: number
  code?: string
  kind: StoreCommandKind | null
  command?: Command
  message: string
  snapshot: BusinessSnapshotSummary
  mutated: boolean
  query?: ClassifiedStoreCommand['query']
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  return slug || `product-${Date.now().toString(36)}`
}

function parsePriceMajor(text: string): number | undefined {
  const rupee = text.match(/(?:₹|rs\.?\s*|inr\s*)\s*([\d,]+(?:\.\d+)?)/i)
  const at = text.match(/\b(?:at|for|priced(?:\s+at)?)\s+(?:₹|rs\.?\s*)?([\d,]+(?:\.\d+)?)/i)
  const raw = rupee?.[1] || at?.[1]
  if (!raw) return undefined
  const n = Number(raw.replace(/,/g, ''))
  return Number.isFinite(n) ? n : undefined
}

function parseStock(text: string): number | undefined {
  const m =
    text.match(/\b(?:stock|qty|quantity|units?)\s+(?:of\s+.+?\s+)?(?:to|=|:)\s*(\d+)\b/i) ||
    text.match(/\b(?:stock|qty|quantity|units?)\s*(?:to|of|=|:)?\s*(\d+)\b/i) ||
    text.match(/\b(\d+)\s+(?:in\s+)?(?:stock|units|pcs|pieces)\b/i)
  if (!m) return undefined
  const n = Number(m[1])
  return Number.isFinite(n) ? n : undefined
}

function parsePercent(text: string): number | undefined {
  const m = text.match(/\bby\s+(\d+(?:\.\d+)?)\s*%/)
  if (!m) return undefined
  const n = Number(m[1])
  return Number.isFinite(n) ? n : undefined
}

function extractCreatedName(text: string): string {
  return productNameFromCreateIntent(text)
}

function extractProductHint(text: string): string | undefined {
  const named = text.match(
    /\b(?:of|for|on|to)\s+(?:the\s+)?["']?([A-Za-z][\w\s-]{1,60}?)["']?(?:\s+(?:to|at|by|₹|size|collection)|$)/i,
  )
  if (named?.[1]) return named[1].trim()
  return undefined
}

export function classifyStoreCommand(message: string): ClassifiedStoreCommand | null {
  const text = (message || '').replace(/<<<INDOBASE_RUNTIME>>>[\s\S]*?<<<END_INDOBASE_RUNTIME>>>/gi, '').trim()
  if (!text || /^SCREEN\b/.test(text) || /^PREVIEW_EDIT\b/.test(text)) return null
  const q = text.toLowerCase()

  if (/\b(go live|take live|launch my|launch this|launch store|start building|build (?:me )?(?:a|an))\b/.test(q)) {
    return null
  }
  if (/\b(hero headline|change the hero|headline to)\b/.test(q)) return null

  if (/\b(low stock|out of stock|which products are low)\b/.test(q)) {
    return { kind: 'catalog.query', readOnly: true, query: 'low-stock' }
  }
  if (/\b(show|list)\b/.test(q) && /\bcollections?\b/.test(q)) {
    return { kind: 'catalog.query', readOnly: true, query: 'collections' }
  }
  if (/\b(show|list|today'?s|latest)\b/.test(q) && /\borders?\b/.test(q)) {
    return { kind: 'orders.query', readOnly: true }
  }
  if (/\bshow (?:me )?(?:the )?(?:catalog|products|inventory)\b/.test(q)) {
    return { kind: 'catalog.query', readOnly: true }
  }

  if (/\bmark\b/.test(q) && /\border\b/.test(q) && /\b(paid|failed|cancelled|canceled|fulfilled|fulfill|processing)\b/.test(q)) {
    let orderHint = text.match(/\b(?:order|#)\s*([a-z0-9_-]+)/i)?.[1]
    if (!orderHint || /^(as|that|the|this|my|latest)$/i.test(orderHint)) orderHint = 'latest'
    if (/\b(fulfilled|fulfill|processing)\b/.test(q) && !/\b(paid|failed)\b/.test(q)) {
      const fulfillmentStatus: 'processing' | 'fulfilled' | 'cancelled' = /\bprocessing\b/.test(q)
        ? 'processing'
        : 'fulfilled'
      return { kind: 'order.fulfill', readOnly: false, orderHint, fulfillmentStatus }
    }
    const orderStatus: 'paid' | 'failed' | 'cancelled' = /\b(cancelled|canceled)\b/.test(q)
      ? 'cancelled'
      : /\bfailed\b/.test(q)
        ? 'failed'
        : 'paid'
    return { kind: 'order.status', readOnly: false, orderHint, orderStatus }
  }

  if (/\b(increase|raise|bump)\b/.test(q) && /\bprices?\b/.test(q)) {
    return {
      kind: 'product.update',
      readOnly: false,
      percent: parsePercent(text) ?? 10,
      productHint: extractProductHint(text),
    }
  }

  if (
    (/\b(set|update|change|restock)\b/.test(q) && /\b(stock|inventory|qty)\b/.test(q)) ||
    /\bincrease (?:the )?stock\b/.test(q)
  ) {
    const sizes = parseSizeValues(text)
    return {
      kind: 'inventory.update',
      readOnly: false,
      stock: parseStock(text),
      productHint: extractProductHint(text),
      variantHint: sizes[0],
    }
  }

  if (/\b(change|update|set)\b/.test(q) && /\b(price|priced|₹|name)\b/.test(q)) {
    return {
      kind: 'product.update',
      readOnly: false,
      name: /\bname\b/.test(q) ? extractCreatedName(text) : undefined,
      priceMajor: parsePriceMajor(text),
      productHint: extractProductHint(text),
    }
  }

  if (
    (/\b(put|add|assign)\b/.test(q) && /\b(in|to|into)\b/.test(q) && /\bcollection\b/.test(q)) ||
    (/\bassign\b/.test(q) && /\bto\b/.test(q) && /\bcollection\b/.test(q))
  ) {
    const productFromAssign = text.match(
      /\b(?:assign|put|add)\s+(?:the\s+)?(.+?)\s+(?:to|in|into)\s+(?:the\s+)?collection\b/i,
    )?.[1]
    return {
      kind: 'collection.assign',
      readOnly: false,
      productHint: productFromAssign?.trim() || extractProductHint(text),
      collectionHint: parseCollectionName(text) || text.match(/\bcollection\s+["']?([A-Za-z][\w\s-]{1,48})/i)?.[1],
    }
  }

  if (/\b(create|add)\b/.test(q) && /\bcollection\b/.test(q)) {
    const name = parseCollectionName(text) || 'New collection'
    const category = text.match(/\b(?:category|tag)\s+([A-Za-z][\w-]{1,32})/i)?.[1]
    return {
      kind: 'collection.create',
      readOnly: false,
      name,
      collectionHint: name,
      description: category,
    }
  }

  if (/\b(add|create)\b/.test(q) && /\bvariant\b/.test(q)) {
    const sizes = parseSizeValues(text)
    const options = parseProductOptions(text)
    return {
      kind: 'variant.create',
      readOnly: false,
      productHint: extractProductHint(text),
      options,
      variantHint: sizes[0],
      priceMajor: parsePriceMajor(text),
      stock: parseStock(text) ?? 10,
    }
  }

  if (
    /^(?:please\s+)?(?:add|create)\b/.test(q) &&
    /\b(product|sku|item|shoe|sneaker|runner|shirt|bag)\b/.test(q)
  ) {
    const options = parseProductOptions(text)
    const sizes = parseSizeValues(text)
    return {
      kind: 'product.create',
      readOnly: false,
      name: extractCreatedName(text),
      description: sizes.length ? `sizes ${sizes.join(', ')}` : undefined,
      priceMajor: parsePriceMajor(text) ?? 0,
      stock: parseStock(text) ?? 10,
      options,
    }
  }

  if (/^(?:please\s+)?add\s+(?:a|an|new|the)\b/.test(q) && (parsePriceMajor(text) != null || parseSizeValues(text).length)) {
    const options = parseProductOptions(text)
    const sizes = parseSizeValues(text)
    return {
      kind: 'product.create',
      readOnly: false,
      name: extractCreatedName(text),
      description: sizes.length ? `sizes ${sizes.join(', ')}` : undefined,
      priceMajor: parsePriceMajor(text) ?? 0,
      stock: parseStock(text) ?? 10,
      options,
    }
  }

  return null
}

export function looksLikeStoreCommand(message: string): boolean {
  return classifyStoreCommand(message) != null
}

function toSnapshot(
  products: StoreProductRecord[],
  orders: Array<Record<string, unknown>>,
  collections?: StoreCollectionRecord[],
): BusinessSnapshotSummary {
  return snapshotFromCommerceRows(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      priceMinor: p.priceMinor,
      stock: p.stock,
      variants: p.variants,
    })),
    orders,
    collections,
  )
}

function fromVariant(v: CommerceVariant): StoreVariantRecord {
  return {
    id: v.id,
    sku: v.sku,
    title: v.title,
    options: v.options,
    priceMinor: v.priceMinor,
    stock: v.stock,
    default: v.default,
  }
}

function fromCommerceProduct(p: CommerceProduct): StoreProductRecord {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    priceMinor: p.priceMinor,
    stock: p.stock,
    currency: p.currency,
    category: p.category,
    variants: (p.variants || []).map(fromVariant),
  }
}

function fromCommerceCollection(c: CommerceCollection): StoreCollectionRecord {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    productIds: c.productIds || [],
    rule: c.rule,
  }
}

export const defaultStoreCommandDeps: StoreCommandDeps = {
  listProducts: async (ref) => (await listCommerceProducts(ref)).map(fromCommerceProduct),
  createProduct: async (ref, input) =>
    fromCommerceProduct(
      await createCommerceProduct(ref, {
        name: input.name,
        slug: input.slug,
        description: input.description,
        priceMinor: input.priceMinor,
        stock: input.stock,
        variants: input.variants,
      }),
    ),
  updateProduct: async (ref, id, patch) => {
    const row = await patchCommerceProduct(ref, id, patch)
    return row ? fromCommerceProduct(row) : null
  },
  createVariant: async (ref, productId, input) => {
    const row = await createCommerceVariant(ref, productId, input)
    return row ? fromVariant(row) : null
  },
  updateVariant: async (ref, variantId, patch) => {
    const row = await patchCommerceVariant(ref, variantId, patch)
    return row ? fromVariant(row) : null
  },
  listCollections: async (ref) => (await listCatalogCollections(ref)).map(fromCommerceCollection),
  createCollection: async (ref, input) => fromCommerceCollection(await createCatalogCollection(ref, input)),
  assignCollectionProduct: async (ref, collectionId, productId) => {
    const row = await assignCatalogCollectionProduct(ref, collectionId, productId)
    return row ? fromCommerceCollection(row) : null
  },
  listOrders: listCommerceOrders,
  updateOrderStatus: async (ref, id, status) => {
    if (status === 'paid') {
      const result = await markOrderPaid({ projectRef: ref, orderId: id })
      return { ok: result.ok, message: result.ok ? 'paid' : result.message, paymentStatus: 'paid' }
    }
    if (status === 'cancelled') {
      const result = await cancelOpenOrder({ projectRef: ref, orderId: id })
      return { ok: result.ok, message: result.ok ? 'cancelled' : result.message, paymentStatus: 'failed', fulfillmentStatus: 'cancelled' }
    }
    const result = await markOrderFailed({ projectRef: ref, orderId: id })
    return { ok: result.ok, message: result.ok ? 'failed' : result.message, paymentStatus: 'failed' }
  },
  updateOrderFulfillment: async (ref, id, fulfillmentStatus) => {
    const result = await markOrderFulfillment({ projectRef: ref, orderId: id, fulfillmentStatus })
    return {
      ok: result.ok,
      message: result.ok ? fulfillmentStatus : result.message,
      paymentStatus: result.ok ? result.paymentStatus : undefined,
      fulfillmentStatus: result.ok ? result.fulfillmentStatus : undefined,
    }
  },
}

export function createMemoryStoreCommandDeps(
  seed?: Record<string, StoreProductRecord[]>,
  seedOrders?: Record<string, Array<Record<string, unknown>>>,
  seedCollections?: Record<string, StoreCollectionRecord[]>,
): StoreCommandDeps {
  const catalogs = new Map<string, StoreProductRecord[]>()
  const orders = new Map<string, Array<Record<string, unknown>>>()
  const collections = new Map<string, StoreCollectionRecord[]>()
  for (const [ref, rows] of Object.entries(seed || {})) {
    catalogs.set(ref, rows.map((r) => ({ ...r, variants: (r.variants || []).map((v) => ({ ...v })) })))
  }
  for (const [ref, rows] of Object.entries(seedOrders || {})) {
    orders.set(ref, rows.map((r) => ({ ...r })))
  }
  for (const [ref, rows] of Object.entries(seedCollections || {})) {
    collections.set(ref, rows.map((r) => ({ ...r, productIds: [...(r.productIds || [])] })))
  }
  let seq = 1
  return {
    listProducts: async (ref) => (catalogs.get(ref) || []).map((r) => ({ ...r, variants: (r.variants || []).map((v) => ({ ...v })) })),
    createProduct: async (ref, input) => {
      const variants: StoreVariantRecord[] = (input.variants || []).map((v, i) => ({
        id: `v${seq++}`,
        sku: v.sku,
        title: v.title,
        options: v.options,
        priceMinor: v.priceMinor,
        stock: v.stock,
        default: i === 0,
      }))
      if (!variants.length) {
        variants.push({
          id: `v${seq++}`,
          sku: slugify(input.name),
          title: 'Default',
          options: {},
          priceMinor: input.priceMinor,
          stock: input.stock,
          default: true,
        })
      }
      const stock = variants.reduce((s, v) => s + (v.stock || 0), 0)
      const row: StoreProductRecord = {
        id: `p${seq++}`,
        name: input.name,
        slug: input.slug || slugify(input.name),
        priceMinor: input.priceMinor,
        stock,
        variants,
      }
      const list = catalogs.get(ref) || []
      list.push(row)
      catalogs.set(ref, list)
      return { ...row, variants: variants.map((v) => ({ ...v })) }
    },
    updateProduct: async (ref, id, patch) => {
      const list = catalogs.get(ref) || []
      const row = list.find((p) => p.id === id)
      if (!row) return null
      if (typeof patch.name === 'string') row.name = patch.name
      if (typeof patch.priceMinor === 'number') row.priceMinor = patch.priceMinor
      if (typeof patch.stock === 'number') row.stock = patch.stock
      return { ...row }
    },
    createVariant: async (ref, productId, input) => {
      const list = catalogs.get(ref) || []
      const product = list.find((p) => p.id === productId)
      if (!product) return null
      const variant: StoreVariantRecord = {
        id: `v${seq++}`,
        sku: input.sku,
        title: input.title,
        options: input.options,
        priceMinor: input.priceMinor,
        stock: input.stock,
        default: !(product.variants || []).length,
      }
      product.variants = [...(product.variants || []), variant]
      product.stock = product.variants.reduce((s, v) => s + (v.stock || 0), 0)
      return { ...variant }
    },
    updateVariant: async (ref, variantId, patch) => {
      const list = catalogs.get(ref) || []
      for (const product of list) {
        const variant = (product.variants || []).find((v) => v.id === variantId)
        if (!variant) continue
        if (typeof patch.stock === 'number') variant.stock = patch.stock
        if (typeof patch.priceMinor === 'number') variant.priceMinor = patch.priceMinor
        product.stock = (product.variants || []).reduce((s, v) => s + (v.stock || 0), 0)
        return { ...variant }
      }
      return null
    },
    listCollections: async (ref) => (collections.get(ref) || []).map((c) => ({ ...c, productIds: [...c.productIds] })),
    createCollection: async (ref, input) => {
      const row: StoreCollectionRecord = {
        id: `c${seq++}`,
        name: input.name,
        slug: input.slug || slugify(input.name),
        productIds: [],
        rule: input.rule || null,
      }
      const list = collections.get(ref) || []
      list.push(row)
      collections.set(ref, list)
      return { ...row, productIds: [] }
    },
    assignCollectionProduct: async (ref, collectionId, productId) => {
      const list = collections.get(ref) || []
      const row = list.find((c) => c.id === collectionId || c.slug === collectionId || c.name.toLowerCase() === collectionId.toLowerCase())
      if (!row) return null
      if (!row.productIds.includes(productId)) row.productIds.push(productId)
      return { ...row, productIds: [...row.productIds] }
    },
    listOrders: async (ref) => [...(orders.get(ref) || [])],
    updateOrderStatus: async (ref, id, status) => {
      const list = orders.get(ref) || []
      const row = list.find((o) => String(o.id) === id)
      if (!row) return { ok: false, message: 'Order not found' }
      if (status === 'cancelled') {
        row.payment_status = 'failed'
        row.fulfillment_status = 'cancelled'
        row.status = 'failed'
        return { ok: true, paymentStatus: 'failed', fulfillmentStatus: 'cancelled' }
      }
      row.payment_status = status
      row.status = status
      if (!row.fulfillment_status) row.fulfillment_status = 'unfulfilled'
      return { ok: true, paymentStatus: status, fulfillmentStatus: String(row.fulfillment_status) }
    },
    updateOrderFulfillment: async (ref, id, fulfillmentStatus) => {
      const list = orders.get(ref) || []
      const row = list.find((o) => String(o.id) === id)
      if (!row) return { ok: false, message: 'Order not found' }
      row.fulfillment_status = fulfillmentStatus
      return {
        ok: true,
        paymentStatus: String(row.payment_status || 'pending'),
        fulfillmentStatus,
      }
    },
  }
}

function matchProduct(products: StoreProductRecord[], hint?: string): StoreProductRecord | undefined {
  if (!hint) return products[0]
  const q = hint.toLowerCase()
  return (
    products.find((p) => p.name.toLowerCase() === q || p.id === hint || p.slug === hint) ||
    products.find((p) => p.name.toLowerCase().includes(q)) ||
    products.find((p) => q.includes(p.name.toLowerCase()) && p.name.length >= 4)
  )
}

function matchVariant(product: StoreProductRecord, hint?: string): StoreVariantRecord | undefined {
  const variants = product.variants || []
  if (!hint) return variants.find((v) => v.default) || variants[0]
  const q = hint.toLowerCase()
  return variants.find(
    (v) =>
      v.id === hint ||
      (v.sku || '').toLowerCase() === q ||
      (v.title || '').toLowerCase() === q ||
      Object.values(v.options || {}).some((val) => String(val).toLowerCase() === q),
  )
}

export async function executeStoreCommand(input: {
  session: { projectRef: string }
  guest?: boolean
  requestedProjectRef?: string
  message: string
  deps?: StoreCommandDeps
}): Promise<StoreCommandResult> {
  const classified = classifyStoreCommand(input.message)
  const empty: BusinessSnapshotSummary = { products: [], orders: [], customers: [] }
  if (!classified) {
    return { ok: true, status: 200, kind: null, message: '', snapshot: empty, mutated: false }
  }

  const auth = authorizeControlCenterAccess({
    session: input.session,
    guest: input.guest,
    requestedProjectRef: input.requestedProjectRef,
  })
  if (!auth.ok) {
    return {
      ok: false,
      status: auth.status,
      code: auth.code,
      kind: classified.kind,
      message: auth.code === 'forbidden' ? 'That workspace is not this session.' : 'Sign in to operate the store.',
      snapshot: empty,
      mutated: false,
    }
  }

  const projectRef = auth.projectRef
  const deps = input.deps || defaultStoreCommandDeps

  const loadSnapshot = async (): Promise<BusinessSnapshotSummary> => {
    const [products, orderRows, collectionRows] = await Promise.all([
      deps.listProducts(projectRef),
      deps.listOrders ? deps.listOrders(projectRef) : Promise.resolve([]),
      deps.listCollections ? deps.listCollections(projectRef) : Promise.resolve([]),
    ])
    return toSnapshot(products, orderRows, collectionRows)
  }

  try {
    if (classified.readOnly) {
      const snapshot = await loadSnapshot()
      const command = createCommand(classified.kind, { projectRef }, { projectRef })
      const message =
        classified.kind === 'orders.query'
          ? snapshot.orders.length
            ? `${snapshot.orders.length} orders.`
            : 'No orders yet.'
          : classified.query === 'collections'
            ? snapshot.collections?.length
              ? `${snapshot.collections.length} collections.`
              : 'No collections yet.'
          : snapshot.products.length
            ? `${snapshot.products.length} products in the catalog.`
            : 'Catalog is empty.'
      return { ok: true, status: 200, kind: classified.kind, command, message, snapshot, mutated: false, query: classified.query }
    }

    if (classified.kind === 'product.create') {
      const name = classified.name || 'New product'
      const slug = slugify(name)
      const priceMinor = majorToMinor(classified.priceMajor ?? 0, 'INR')
      const stockEach = classified.stock ?? 10
      const variants = classified.options
        ? variantRowsFromOptions(slug, classified.options, priceMinor, stockEach)
        : []
      const existing = matchProduct(await deps.listProducts(projectRef), name)
      if (existing && variants.length && deps.createVariant) {
        const had = existing.variants?.length || 0
        for (let i = 0; i < variants.length; i++) {
          await deps.createVariant(projectRef, existing.id, {
            ...variants[i],
            default: had === 0 && i === 0,
          })
        }
        const snapshot = await loadSnapshot()
        const command = createCommand(
          'product.create',
          {
            projectRef,
            productId: existing.id,
            name: existing.name,
            variantCount: snapshot.products.find((p) => p.id === existing.id)?.variants?.length || variants.length,
          },
          { projectRef },
        )
        return {
          ok: true,
          status: 200,
          kind: 'product.create',
          command,
          message: `Added ${variants.length} variants to ${existing.name}.`,
          snapshot,
          mutated: true,
        }
      }
      const created = await deps.createProduct(projectRef, {
        name,
        slug,
        description: classified.description,
        priceMinor,
        stock: variants.length ? variants.reduce((s, v) => s + v.stock, 0) : stockEach,
        options: classified.options,
        variants,
      })
      const snapshot = await loadSnapshot()
      const command = createCommand(
        'product.create',
        {
          projectRef,
          productId: created.id,
          name: created.name,
          variantCount: created.variants?.length || 0,
        },
        { projectRef },
      )
      const variantNote = created.variants?.length
        ? ` with ${created.variants.length} variants`
        : ''
      return {
        ok: true,
        status: 200,
        kind: 'product.create',
        command,
        message: `Added ${created.name} to the catalog${variantNote}.`,
        snapshot,
        mutated: true,
      }
    }

    const products = await deps.listProducts(projectRef)
    if (classified.kind === 'product.update') {
      if (classified.percent && !classified.productHint) {
        for (const p of products) {
          const next = Math.round(p.priceMinor * (1 + classified.percent / 100))
          await deps.updateProduct(projectRef, p.id, { priceMinor: next })
        }
        const snapshot = await loadSnapshot()
        const command = createCommand('product.update', { projectRef, percent: classified.percent }, { projectRef })
        return {
          ok: true,
          status: 200,
          kind: 'product.update',
          command,
          message: `Increased catalog prices by ${classified.percent}%.`,
          snapshot,
          mutated: true,
        }
      }
      const target = matchProduct(products, classified.productHint)
      if (!target) {
        return {
          ok: false,
          status: 404,
          code: 'not_found',
          kind: classified.kind,
          message: 'No matching product in this catalog.',
          snapshot: await loadSnapshot(),
          mutated: false,
        }
      }
      const patch: { name?: string; priceMinor?: number } = {}
      if (classified.name) patch.name = classified.name
      if (typeof classified.priceMajor === 'number') patch.priceMinor = majorToMinor(classified.priceMajor, 'INR')
      if (classified.percent) patch.priceMinor = Math.round(target.priceMinor * (1 + classified.percent / 100))
      await deps.updateProduct(projectRef, target.id, patch)
      const snapshot = await loadSnapshot()
      const command = createCommand('product.update', { projectRef, productId: target.id }, { projectRef })
      return {
        ok: true,
        status: 200,
        kind: 'product.update',
        command,
        message: `Updated ${target.name}.`,
        snapshot,
        mutated: true,
      }
    }

    if (classified.kind === 'inventory.update') {
      const target = matchProduct(products, classified.productHint)
      if (!target || typeof classified.stock !== 'number') {
        return {
          ok: false,
          status: 400,
          code: 'invalid_request',
          kind: classified.kind,
          message: 'Say which product and the new stock count.',
          snapshot: await loadSnapshot(),
          mutated: false,
        }
      }
      const variant =
        matchVariant(target, classified.variantHint) ||
        (target.variants || []).find((v) => v.default) ||
        target.variants?.[0]
      if (variant && deps.updateVariant) {
        await deps.updateVariant(projectRef, variant.id, { stock: classified.stock })
        const snapshot = await loadSnapshot()
        const command = createCommand(
          'inventory.update',
          { projectRef, productId: target.id, variantId: variant.id, stock: classified.stock },
          { projectRef },
        )
        return {
          ok: true,
          status: 200,
          kind: 'inventory.update',
          command,
          message: `Stock for ${target.name} ${variant.title || variant.sku || ''} is now ${classified.stock}.`.replace(/\s+/g, ' ').trim(),
          snapshot,
          mutated: true,
        }
      }
      await deps.updateProduct(projectRef, target.id, { stock: classified.stock })
      const snapshot = await loadSnapshot()
      const command = createCommand('inventory.update', { projectRef, productId: target.id, stock: classified.stock }, { projectRef })
      return {
        ok: true,
        status: 200,
        kind: 'inventory.update',
        command,
        message: `Stock for ${target.name} is now ${classified.stock}.`,
        snapshot,
        mutated: true,
      }
    }

    if (classified.kind === 'variant.create') {
      const target = matchProduct(products, classified.productHint)
      if (!target || !deps.createVariant) {
        return {
          ok: false,
          status: 404,
          code: 'not_found',
          kind: classified.kind,
          message: 'No matching product in this catalog.',
          snapshot: await loadSnapshot(),
          mutated: false,
        }
      }
      const rows = classified.options
        ? variantRowsFromOptions(target.slug || slugify(target.name), classified.options, target.priceMinor, classified.stock ?? 10)
        : []
      const row = rows[0] || {
        sku: `${target.slug || target.id}-${classified.variantHint || 'var'}`,
        title: classified.variantHint || 'Variant',
        options: classified.variantHint ? { Size: classified.variantHint } : {},
        priceMinor: target.priceMinor,
        stock: classified.stock ?? 10,
      }
      const created = await deps.createVariant(projectRef, target.id, row)
      const snapshot = await loadSnapshot()
      const command = createCommand('variant.create', { projectRef, productId: target.id, variantId: created?.id }, { projectRef })
      return {
        ok: Boolean(created),
        status: created ? 200 : 400,
        kind: 'variant.create',
        command,
        message: created ? `Added variant ${created.title || created.sku} to ${target.name}.` : 'Could not add variant.',
        snapshot,
        mutated: Boolean(created),
      }
    }

    if (classified.kind === 'collection.create') {
      if (!deps.createCollection) {
        return {
          ok: false,
          status: 400,
          code: 'invalid_request',
          kind: classified.kind,
          message: 'Collections are not available.',
          snapshot: await loadSnapshot(),
          mutated: false,
        }
      }
      const name = classified.name || 'New collection'
      const category = classified.description
      const created = await deps.createCollection(projectRef, {
        name,
        slug: slugify(name),
        rule: category ? { category } : null,
      })
      const snapshot = await loadSnapshot()
      const command = createCommand('collection.create', { projectRef, collectionId: created.id, name }, { projectRef })
      return {
        ok: true,
        status: 200,
        kind: 'collection.create',
        command,
        message: `Created collection ${created.name}.`,
        snapshot,
        mutated: true,
      }
    }

    if (classified.kind === 'collection.assign') {
      const target = matchProduct(products, classified.productHint)
      const collectionRows = deps.listCollections ? await deps.listCollections(projectRef) : []
      const hint = (classified.collectionHint || '').toLowerCase()
      const collection =
        collectionRows.find((c) => c.id === classified.collectionHint || (c.slug || '').toLowerCase() === hint || c.name.toLowerCase() === hint) ||
        collectionRows.find((c) => c.name.toLowerCase().includes(hint))
      if (!target || !collection || !deps.assignCollectionProduct) {
        return {
          ok: false,
          status: 404,
          code: 'not_found',
          kind: classified.kind,
          message: 'Say which product and which collection.',
          snapshot: await loadSnapshot(),
          mutated: false,
        }
      }
      await deps.assignCollectionProduct(projectRef, collection.id, target.id)
      const snapshot = await loadSnapshot()
      const command = createCommand(
        'collection.assign',
        { projectRef, collectionId: collection.id, productId: target.id },
        { projectRef },
      )
      return {
        ok: true,
        status: 200,
        kind: 'collection.assign',
        command,
        message: `Added ${target.name} to ${collection.name}.`,
        snapshot,
        mutated: true,
      }
    }

    if (classified.kind === 'order.status' || classified.kind === 'order.fulfill') {
      const orderRows = deps.listOrders ? await deps.listOrders(projectRef) : []
      const hint = (classified.orderHint || '').toLowerCase()
      const row =
        (hint && orderRows.find((o) => String(o.id || o.orderNumber || '').toLowerCase() === hint)) ||
        (hint === 'latest' ? orderRows[0] : null) ||
        (!hint ? orderRows[0] : null)
      const orderId = row ? String(row.id || '') : classified.orderHint || ''
      if (!orderId) {
        return {
          ok: false,
          status: 400,
          code: 'invalid_request',
          kind: classified.kind,
          message: 'No matching order.',
          snapshot: await loadSnapshot(),
          mutated: false,
        }
      }
      if (classified.kind === 'order.fulfill') {
        if (!deps.updateOrderFulfillment || !classified.fulfillmentStatus) {
          return {
            ok: false,
            status: 400,
            code: 'invalid_request',
            kind: classified.kind,
            message: 'No matching order.',
            snapshot: await loadSnapshot(),
            mutated: false,
          }
        }
        const updated = await deps.updateOrderFulfillment(projectRef, orderId, classified.fulfillmentStatus)
        const snapshot = await loadSnapshot()
        const command = createCommand(
          'order.fulfill',
          { projectRef, orderId, fulfillmentStatus: classified.fulfillmentStatus },
          { projectRef },
        )
        const payment = updated.paymentStatus || 'pending'
        return {
          ok: updated.ok,
          status: updated.ok ? 200 : 400,
          kind: 'order.fulfill',
          command,
          message: updated.ok
            ? `Order ${orderId} is ${classified.fulfillmentStatus}. Payment is ${payment}.`
            : updated.message || 'Could not update the order.',
          snapshot,
          mutated: updated.ok,
        }
      }
      if (!deps.updateOrderStatus || !classified.orderStatus) {
        return {
          ok: false,
          status: 400,
          code: 'invalid_request',
          kind: classified.kind,
          message: 'No matching order.',
          snapshot: await loadSnapshot(),
          mutated: false,
        }
      }
      const updated = await deps.updateOrderStatus(projectRef, orderId, classified.orderStatus)
      const snapshot = await loadSnapshot()
      const command = createCommand('order.status', { projectRef, orderId, status: classified.orderStatus }, { projectRef })
      return {
        ok: updated.ok,
        status: updated.ok ? 200 : 400,
        kind: 'order.status',
        command,
        message: updated.ok
          ? `Order ${orderId} payment is ${classified.orderStatus === 'cancelled' ? 'failed' : classified.orderStatus}.`
          : updated.message || 'Could not update the order.',
        snapshot,
        mutated: updated.ok,
      }
    }

    return { ok: true, status: 200, kind: classified.kind, message: '', snapshot: await loadSnapshot(), mutated: false }
  } catch (err) {
    console.error('store-command failed', classified?.kind, err)
    return {
      ok: false,
      status: 502,
      code: 'backend_unavailable',
      kind: classified.kind,
      message: 'I could not update the catalog just now.',
      snapshot: empty,
      mutated: false,
    }
  }
}
