/**
 * V1.1 Customer Commerce Identity — contract, not agent tools.
 *
 * Auth Identity  →  Customer Profile  →  orders / addresses / metadata
 * PocketBase `users` is not the commerce customer model.
 *
 * Browse/cart/checkout stay anonymous. Ownership is assigned at checkout.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const CUSTOMER_CONTRACT_VERSION = 'ecommerce-contract/v1.1' as const

export const CUSTOMER_INVARIANT_IDS = [
  'CUSTOMER-001',
  'CUSTOMER-002',
  'CUSTOMER-003',
  'CUSTOMER-004',
  'CUSTOMER-005',
  'CUSTOMER-006',
  'CUSTOMER-007',
] as const

export type CustomerInvariantId = (typeof CUSTOMER_INVARIANT_IDS)[number]

export type CustomerType = 'guest' | 'registered'

export type CustomerCommerceState =
  | 'anonymous'
  | 'guest_customer'
  | 'registered_unverified'
  | 'registered_customer'
  | 'order_owner'

export type CustomerProfile = {
  id: string
  projectRef: string
  email: string
  name: string
  phone?: string
  customerType: CustomerType
  /** Session subject — never a PocketBase auth collection id requirement. */
  authIdentityId: string | null
  /** True only after OTP proved control of this email. Guest email is contact, not proof. */
  emailVerified: boolean
  createdAt: string
}

export type CustomerSession = {
  projectRef: string
  customerId: string
  authIdentityId: string
  email: string
  name: string
  emailVerified: boolean
  exp: number
}

export type OrderOwnership = {
  orderId: string
  projectRef: string
  customerId: string
  customerType: CustomerType
  email: string
  guestTokenHash?: string
}

export type GuestClaimant = {
  customerId: string
  projectRef: string
  email: string
  emailVerified: boolean
}

export type GuestClaimDenial =
  | 'unverified'
  | 'email_mismatch'
  | 'cross_tenant'
  | 'not_guest'
  | 'already_claimed_by_other'
  | 'missing_claimant'

export type GuestClaimResult =
  | { ok: true; outcome: 'claimed' | 'already_owned' }
  | { ok: false; reason: GuestClaimDenial }

/**
 * V1.1 uses localStorage JWT sessions because of the static-site ABI.
 * This is an accepted release constraint, not the target security architecture.
 */
export const CUSTOMER_SESSION_STORAGE = 'localStorage_jwt_accepted_v1_1_constraint' as const

export const CUSTOMER_SECURITY_BACKLOG = [
  'session_httponly_cookie',
  'session_secure_cookie',
  'session_samesite_cookie',
  'csrf_strategy',
  'storefront_csp_hardening',
  'xss_regression_suite',
] as const

export const CUSTOMER_APPLICATION_CONTRACT = {
  applicationType: 'ecommerce' as const,
  version: CUSTOMER_CONTRACT_VERSION,
  capabilities: [
    {
      id: 'customer_identity',
      required: true,
      description: 'Commerce customer profile distinct from auth identity.',
    },
    {
      id: 'email_verification',
      required: true,
      description: 'OTP verifies email for registered customers.',
    },
    {
      id: 'session',
      required: true,
      description: 'Signed customer session survives refresh; logout revokes access.',
    },
    {
      id: 'guest_checkout',
      required: true,
      description: 'Anonymous browse/cart/checkout; guest order owned server-side.',
    },
    {
      id: 'order_ownership',
      required: true,
      description: 'Each checkout creates exactly one customer↔order relationship.',
    },
    {
      id: 'order_history',
      required: true,
      description: 'Registered customers list only their own orders.',
    },
  ],
  requiredFlows: [
    'anonymous_browse',
    'guest_checkout',
    'otp_verify',
    'registered_checkout',
    'my_orders',
    'logout',
    'cross_customer_isolation',
    'two_browser_isolation',
    'verified_email_claim',
    'state_transitions',
  ],
} as const

export function normalizeCustomerEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function newCustomerId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  const bytes = randomBytes(15)
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}

export function hashGuestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function issueGuestToken(): { token: string; hash: string } {
  const token = `gtk_${randomBytes(24).toString('base64url')}`
  return { token, hash: hashGuestToken(token) }
}

export function guestTokenMatches(token: string | null | undefined, hash: string | null | undefined): boolean {
  if (!token || !hash) return false
  const actual = Buffer.from(hashGuestToken(token))
  const expected = Buffer.from(hash)
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export function checkoutCreatesSingleOwnership(order: OrderOwnership): boolean {
  return Boolean(order.orderId && order.customerId && order.projectRef)
}

export function canViewOrder(input: {
  order: OrderOwnership
  session: CustomerSession | null
  guestToken?: string | null
}): boolean {
  if (input.order.projectRef !== (input.session?.projectRef || input.order.projectRef)) {
    if (input.session && input.session.projectRef !== input.order.projectRef) return false
  }
  if (input.session) {
    return (
      input.session.projectRef === input.order.projectRef &&
      input.session.customerId === input.order.customerId
    )
  }
  return guestTokenMatches(input.guestToken, input.order.guestTokenHash)
}

export function canListOrder(order: OrderOwnership, session: CustomerSession | null): boolean {
  if (!session) return false
  return session.projectRef === order.projectRef && session.customerId === order.customerId
}

export function canModifyOrder(order: OrderOwnership, session: CustomerSession | null): boolean {
  return canListOrder(order, session)
}

export function guestOrderVisibleToOtherGuest(input: {
  order: OrderOwnership
  otherGuestToken?: string | null
}): boolean {
  return guestTokenMatches(input.otherGuestToken, input.order.guestTokenHash)
}

/**
 * CUSTOMER-007 — email is an identifier, not proof of ownership.
 * Claim requires: same tenant + verified email + normalized equality + guest-eligible order.
 */
export function evaluateGuestOrderClaim(
  order: OrderOwnership,
  claimant: GuestClaimant | null,
): GuestClaimResult {
  if (!claimant?.customerId) return { ok: false, reason: 'missing_claimant' }
  if (!claimant.emailVerified) return { ok: false, reason: 'unverified' }
  if (claimant.projectRef !== order.projectRef) return { ok: false, reason: 'cross_tenant' }
  if (normalizeCustomerEmail(claimant.email) !== normalizeCustomerEmail(order.email)) {
    return { ok: false, reason: 'email_mismatch' }
  }
  if (order.customerType === 'registered') {
    if (order.customerId === claimant.customerId) return { ok: true, outcome: 'already_owned' }
    return { ok: false, reason: 'already_claimed_by_other' }
  }
  if (order.customerType !== 'guest') return { ok: false, reason: 'not_guest' }
  return { ok: true, outcome: 'claimed' }
}

export function applyGuestOrderClaim(
  order: OrderOwnership,
  claimant: GuestClaimant | null,
): { order: OrderOwnership; result: GuestClaimResult } {
  const result = evaluateGuestOrderClaim(order, claimant)
  if (!result.ok || result.outcome === 'already_owned' || !claimant) {
    return { order, result }
  }
  return {
    result,
    order: {
      ...order,
      customerId: claimant.customerId,
      customerType: 'registered',
      guestTokenHash: undefined,
    },
  }
}

/** @deprecated Use evaluateGuestOrderClaim — email match alone is not sufficient. */
export function upgradePreservesGuestOrders(input: {
  guestEmail: string
  registeredEmail: string
  guestProjectRef: string
  registeredProjectRef: string
  emailVerified?: boolean
}): boolean {
  return (
    Boolean(input.emailVerified) &&
    normalizeCustomerEmail(input.guestEmail) === normalizeCustomerEmail(input.registeredEmail) &&
    input.guestProjectRef === input.registeredProjectRef
  )
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

export function customerSessionSecret(): string {
  const secret = (
    process.env.INDOBASE_CUSTOMER_SESSION_SECRET ||
    process.env.BUILDER_CFOS_HANDOFF_SECRET ||
    process.env.BUILDER_HANDOFF_SECRET ||
    ''
  ).trim()
  if (secret.length < 32) {
    throw new Error('Customer session secret missing or shorter than 32 chars')
  }
  return secret
}

const SESSION_TTL_SEC = 30 * 24 * 60 * 60

export function signCustomerSession(session: Omit<CustomerSession, 'exp'>, now = Date.now()): string {
  const payload: CustomerSession = {
    ...session,
    email: normalizeCustomerEmail(session.email),
    emailVerified: session.emailVerified === true,
    exp: Math.floor(now / 1000) + SESSION_TTL_SEC,
  }
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac('sha256', customerSessionSecret()).update(`${header}.${body}`).digest()
  return `${header}.${body}.${b64url(sig)}`
}

export function verifyCustomerSession(
  token: string | null | undefined,
  projectRef: string,
  now = Date.now(),
): CustomerSession | null {
  if (!token) return null
  let secret: string
  try {
    secret = customerSessionSecret()
  } catch {
    return null
  }
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, sigB64] = parts
  const expected = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest()
  const actual = b64urlDecode(sigB64)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  try {
    const payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as CustomerSession
    if (payload.projectRef !== projectRef) return null
    if (!payload.customerId || !payload.email) return null
    if (typeof payload.exp === 'number' && payload.exp * 1000 < now) return null
    return { ...payload, emailVerified: payload.emailVerified === true }
  } catch {
    return null
  }
}
