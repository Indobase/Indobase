/**
 * BusinessData — agent-facing surface (ADR 0008).
 *
 * Products, customers, orders, inventory, content, documents, settings.
 * Never “query PocketBase”. PocketBase is one BusinessDataAdapter impl.
 */

export type BusinessProduct = {
  id: string
  name: string
  priceMinor?: number
  sku?: string
  status?: string
}

export type BusinessCustomer = {
  id: string
  email?: string
  name?: string
}

export type BusinessOrder = {
  id: string
  orderNumber?: string
  status?: string
  paymentStatus?: string
  amountMinor?: number
  email?: string
  customerName?: string
  itemsSummary?: string
}

export type BusinessInventoryItem = {
  id: string
  productId?: string
  sku?: string
  quantity?: number
}

export type BusinessContent = {
  id: string
  title?: string
  kind?: string
}

export type BusinessDocument = {
  id: string
  title?: string
  kind?: string
}

export type BusinessSettings = {
  currency?: string
  timezone?: string
  locale?: string
  extra?: Record<string, unknown>
}

export type BusinessDataSnapshot = {
  products: BusinessProduct[]
  customers: BusinessCustomer[]
  orders: BusinessOrder[]
  inventory?: BusinessInventoryItem[]
  content?: BusinessContent[]
  documents?: BusinessDocument[]
  settings?: BusinessSettings | null
}

export type BusinessDataAdapter = {
  listProducts(businessRef: string): Promise<BusinessProduct[]>
  listCustomers(businessRef: string): Promise<BusinessCustomer[]>
  listOrders(businessRef: string): Promise<BusinessOrder[]>
  snapshot?(businessRef: string): Promise<BusinessDataSnapshot>
}
