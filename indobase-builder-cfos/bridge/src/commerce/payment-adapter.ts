/**
 * Payment provider adapter — platform-owned, behind the Commerce ABI.
 * The storefront never imports this. The state machine never names a PSP.
 */
export type PaymentProvider = 'razorpay' | 'stripe'

export type PaymentSessionRequest = {
  orderId: string
  amountMinor: number
  currency: string
  returnUrl?: string
}

export type ParsedPaymentWebhook = {
  providerEventId: string
  outcome: 'success' | 'failure'
}

export type PaymentAdapter = {
  provider: PaymentProvider
  createSession(req: PaymentSessionRequest): Promise<{ paymentUrl: string; providerRef: string }>
  parseWebhook(raw: unknown): ParsedPaymentWebhook | null
}
