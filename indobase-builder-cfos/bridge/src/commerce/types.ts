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
}

export type PricedLine = {
  productId: string
  slug: string
  name: string
  quantity: number
  unitPriceMinor: number
  lineTotalMinor: number
  currency: string
}
