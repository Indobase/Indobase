export type CommerceCustomerInput = {
  email: string
  name?: string
  phone?: string
}

export type CommerceShippingAddress = {
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

export type CommerceCheckoutItemInput = {
  productId: string
  variantId?: string
  quantity: number
}

export type CommerceCheckoutRequest = {
  projectRef: string
  items: CommerceCheckoutItemInput[]
  customer: CommerceCustomerInput
  shippingAddress?: CommerceShippingAddress
  idempotencyKey: string
  /** Optional return URL after hosted payment */
  returnUrl?: string
  /** Registered customer session (V1.1). Absent → guest checkout. */
  customerSession?: import('./customer-identity.js').CustomerSession | null
}

export type CommerceCheckoutResult = {
  ok: true
  orderId: string
  paymentRequired: boolean
  paymentUrl: string | null
  amountMinor: number
  currency: string
  paymentStatus: 'pending' | 'paid' | 'failed' | 'cancelled'
  reservationExpiresAt: string
  message: string
  customerId?: string
  customerType?: 'guest' | 'registered'
  guestToken?: string | null
}

export type CommerceCheckoutError = {
  ok: false
  code:
    | 'invalid_request'
    | 'invalid_product'
    | 'out_of_stock'
    | 'gateway_not_ready'
    | 'backend_unavailable'
    | 'cross_tenant'
    | 'checkout_failed'
  message: string
}

export type CommerceVariant = {
  id: string
  productId: string
  sku: string
  title: string
  options: Record<string, string>
  priceMinor: number
  stock: number
  currency: string
  default?: boolean
}

export type CommerceCollection = {
  id: string
  name: string
  slug: string
  productIds: string[]
  rule?: { category?: string; tag?: string } | null
}

export type CommerceProduct = {
  id: string
  name: string
  slug: string
  description: string
  priceMinor: number
  currency: string
  stock: number
  imageUrl: string
  active: boolean
  category?: string
  variants?: CommerceVariant[]
}

export type PricedLine = {
  productId: string
  variantId: string
  slug: string
  name: string
  quantity: number
  unitPriceMinor: number
  lineTotalMinor: number
  currency: string
}
