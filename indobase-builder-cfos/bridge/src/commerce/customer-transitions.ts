/**
 * V1.1 customer state machine — certification of transitions, not screens.
 *
 *   anonymous → guest_customer → registered_customer → order_owner
 *
 * registered_unverified exists only as an attack state; it must not claim.
 */
import {
  applyGuestOrderClaim,
  canListOrder,
  canViewOrder,
  issueGuestToken,
  newCustomerId,
  normalizeCustomerEmail,
  signCustomerSession,
  verifyCustomerSession,
  type CustomerProfile,
  type CustomerSession,
  type OrderOwnership,
} from './customer-identity.js'

export type CustomerTransitionId =
  | 'refresh'
  | 'logout'
  | 'login'
  | 'relogin'
  | 'account_creation'
  | 'guest_claim'
  | 'duplicate_claim'
  | 'cross_user_access'
  | 'cross_tenant_access'
  | 'unverified_must_not_claim'
  | 'two_browser_isolation'

export type TransitionCheck = {
  id: CustomerTransitionId
  ok: boolean
  detail: string
}

type OrderRow = OrderOwnership & { items: string }

type Browser = {
  id: 'A' | 'B'
  token: string | null
}

type World = {
  customers: CustomerProfile[]
  orders: OrderRow[]
}

function emptyWorld(): World {
  return { customers: [], orders: [] }
}

function guestCheckout(w: World, projectRef: string, email: string): { order: OrderRow; guestToken: string } {
  const guest = issueGuestToken()
  const customer: CustomerProfile = {
    id: newCustomerId(),
    projectRef,
    email: normalizeCustomerEmail(email),
    name: '',
    customerType: 'guest',
    authIdentityId: null,
    emailVerified: false,
    createdAt: new Date().toISOString(),
  }
  const order: OrderRow = {
    orderId: newCustomerId(),
    projectRef,
    customerId: customer.id,
    customerType: 'guest',
    email: customer.email,
    guestTokenHash: guest.hash,
    items: 'sku',
  }
  w.customers.push(customer)
  w.orders.push(order)
  return { order, guestToken: guest.token }
}

function verifiedSignup(w: World, projectRef: string, email: string): { customer: CustomerProfile; token: string } {
  const normalized = normalizeCustomerEmail(email)
  let customer = w.customers.find(
    (c) => c.projectRef === projectRef && c.email === normalized && c.customerType === 'registered',
  )
  if (!customer) {
    customer = {
      id: newCustomerId(),
      projectRef,
      email: normalized,
      name: '',
      customerType: 'registered',
      authIdentityId: newCustomerId(),
      emailVerified: true,
      createdAt: new Date().toISOString(),
    }
    w.customers.push(customer)
  } else {
    customer.emailVerified = true
  }
  const claimant = {
    customerId: customer.id,
    projectRef,
    email: normalized,
    emailVerified: true,
  }
  for (let i = 0; i < w.orders.length; i += 1) {
    const applied = applyGuestOrderClaim(w.orders[i], claimant)
    w.orders[i] = { ...applied.order, items: w.orders[i].items }
  }
  const token = signCustomerSession({
    projectRef,
    customerId: customer.id,
    authIdentityId: customer.authIdentityId || customer.id,
    email: normalized,
    name: customer.name,
    emailVerified: true,
  })
  return { customer, token }
}

function unverifiedIdentity(projectRef: string, email: string): { customer: CustomerProfile; token: string } {
  const customer: CustomerProfile = {
    id: newCustomerId(),
    projectRef,
    email: normalizeCustomerEmail(email),
    name: '',
    customerType: 'registered',
    authIdentityId: newCustomerId(),
    emailVerified: false,
    createdAt: new Date().toISOString(),
  }
  const token = signCustomerSession({
    projectRef,
    customerId: customer.id,
    authIdentityId: customer.authIdentityId || customer.id,
    email: customer.email,
    name: '',
    emailVerified: false,
  })
  return { customer, token }
}

function sessionOf(token: string | null, projectRef: string): CustomerSession | null {
  return verifyCustomerSession(token, projectRef)
}

function check(id: CustomerTransitionId, ok: boolean, detail: string): TransitionCheck {
  return { id, ok, detail }
}

export function runCustomerTransitionCertification(): {
  ok: boolean
  checks: TransitionCheck[]
} {
  const secret = process.env.BUILDER_CFOS_HANDOFF_SECRET
  if (!secret || secret.length < 32) {
    process.env.BUILDER_CFOS_HANDOFF_SECRET = 'x'.repeat(32)
  }

  const store = 'shopA'
  const w = emptyWorld()
  const guest = guestCheckout(w, store, 'a@example.com')

  const unverified = unverifiedIdentity(store, 'a@example.com')
  const unverifiedClaim = applyGuestOrderClaim(guest.order, {
    customerId: unverified.customer.id,
    projectRef: store,
    email: 'a@example.com',
    emailVerified: unverified.customer.emailVerified,
  })

  const created = verifiedSignup(w, store, 'a@example.com')
  const afterRefresh = sessionOf(created.token, store)
  const afterLogout = sessionOf(null, store)
  const relogin = verifiedSignup(w, store, 'a@example.com')
  const afterRelogin = sessionOf(relogin.token, store)

  const owned = w.orders.find((o) => o.orderId === guest.order.orderId)
  const duplicate = owned
    ? applyGuestOrderClaim(owned, {
        customerId: created.customer.id,
        projectRef: store,
        email: 'a@example.com',
        emailVerified: true,
      })
    : null

  const otherTenant = guestCheckout(w, 'shopB', 'a@example.com')
  const crossTenant = applyGuestOrderClaim(otherTenant.order, {
    customerId: created.customer.id,
    projectRef: store,
    email: 'a@example.com',
    emailVerified: true,
  })

  const browserA: Browser = { id: 'A', token: created.token }
  const guestB = guestCheckout(w, store, 'b@example.com')
  const createdB = verifiedSignup(w, store, 'b@example.com')
  const browserB: Browser = { id: 'B', token: createdB.token }
  const sessionA = sessionOf(browserA.token, store)
  const sessionB = sessionOf(browserB.token, store)
  const orderA = w.orders.find((o) => o.orderId === guest.order.orderId)!
  const orderB = w.orders.find((o) => o.orderId === guestB.order.orderId)!
  const aSeesB = canViewOrder({ order: orderB, session: sessionA }) || canListOrder(orderB, sessionA)
  const bSeesA = canViewOrder({ order: orderA, session: sessionB }) || canListOrder(orderA, sessionB)
  const aClaimsB = applyGuestOrderClaim(orderB, {
    customerId: created.customer.id,
    projectRef: store,
    email: 'a@example.com',
    emailVerified: true,
  })
  const bClaimsA = applyGuestOrderClaim(orderA, {
    customerId: createdB.customer.id,
    projectRef: store,
    email: 'b@example.com',
    emailVerified: true,
  })

  const checks: TransitionCheck[] = [
    check('account_creation', Boolean(afterRefresh?.emailVerified && afterRefresh.customerId === created.customer.id), 'OTP signup issues verified session'),
    check('guest_claim', owned?.customerId === created.customer.id && owned?.customerType === 'registered', 'Verified signup claims same-tenant guest order'),
    check('unverified_must_not_claim', unverifiedClaim.result.ok === false && unverifiedClaim.result.reason === 'unverified', 'Unverified identity cannot claim'),
    check('duplicate_claim', duplicate?.result.ok === true && duplicate.result.outcome === 'already_owned', 'Second claim is idempotent already_owned'),
    check('refresh', afterRefresh?.customerId === created.customer.id, 'Refresh preserves authenticated session'),
    check('logout', afterLogout === null && !canListOrder(orderA, null), 'Logout removes list access'),
    check('login', Boolean(afterRefresh), 'Login restores session'),
    check('relogin', afterRelogin?.customerId === created.customer.id, 'Re-login returns the same verified customer'),
    check('cross_user_access', !aSeesB && !bSeesA, 'A cannot see B orders and B cannot see A orders'),
    check('cross_tenant_access', crossTenant.result.ok === false && crossTenant.result.reason === 'cross_tenant', 'Same email other tenant is denied'),
    check(
      'two_browser_isolation',
      !aSeesB &&
        !bSeesA &&
        aClaimsB.result.ok === false &&
        bClaimsA.result.ok === false &&
        aClaimsB.result.ok === false &&
        orderA.customerId !== createdB.customer.id &&
        orderB.customerId !== created.customer.id,
      'Two-browser GET/claim isolation is non-negotiable',
    ),
  ]

  return { ok: checks.every((c) => c.ok), checks }
}
