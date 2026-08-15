/**
 * Typed storefront ABIs injected by Builder CFOS into published Vite apps.
 * Agents and scaffolds should target these shapes — not PocketBase REST.
 */

export type IndobaseEnv = {
  PROJECT_REF?: string
  INDOBASE_RECORDS_BASE?: string
  INDOBASE_COMMERCE_URL?: string
  INDOBASE_LEADS_URL?: string
  INDOBASE_URL?: string
}

export type Enquiry = {
  name: string
  email?: string
  phone?: string
  message?: string
}

export type EnquiryResult = { ok: boolean; message: string }

export type LeadsAbi = {
  submit: (enquiry: Enquiry) => Promise<EnquiryResult>
}

export type AuthSession = {
  email: string
  token?: string
}

export type AuthAbi = {
  startOtp: (input: { email: string }) => Promise<{ ok: boolean; message?: string }>
  verify: (input: {
    email: string
    code?: string
    otp?: string
    password?: string
  }) => Promise<{ ok: boolean; session?: AuthSession; message?: string }>
  currentSession?: () => AuthSession | null
  signOut?: () => void
}

export type CommerceProduct = {
  id: string
  name: string
  slug?: string
  priceMinor?: number
  currency?: string
  stock?: number
  variants?: Array<{
    id: string
    title?: string
    priceMinor?: number
    stock?: number
    default?: boolean
  }>
}

export type CommerceCartLine = {
  variantId: string
  quantity: number
}

export type CommerceCheckoutResult = {
  ok: boolean
  orderId?: string
  paymentUrl?: string | null
  message?: string
}

export type CommerceAbi = {
  products: {
    list: () => Promise<CommerceProduct[]>
  }
  cart?: {
    get?: () => CommerceCartLine[]
    set?: (lines: CommerceCartLine[]) => void
  }
  checkout: {
    create: (input: {
      items: CommerceCartLine[]
      customer: { email: string; name?: string; phone?: string }
    }) => Promise<CommerceCheckoutResult>
  }
}

export type IndobaseWindow = {
  indobase?: {
    leads?: LeadsAbi
    auth?: AuthAbi
    commerce?: CommerceAbi
  }
  __INDOBASE_ENV__?: IndobaseEnv
}

/** Narrow window for generated apps without fighting DOM typings. */
export function indobaseWindow(win: unknown = typeof window !== 'undefined' ? window : undefined): IndobaseWindow {
  return (win || {}) as IndobaseWindow
}
