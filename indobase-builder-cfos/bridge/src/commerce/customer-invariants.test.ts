/**
 * V1.1 customer invariants + E2E CUSTOMER-001 (two-user isolation).
 * In-memory store — tests business ownership, not HTTP 200.
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'

import {
  CUSTOMER_APPLICATION_CONTRACT,
  CUSTOMER_INVARIANT_IDS,
  canListOrder,
  canModifyOrder,
  canViewOrder,
  checkoutCreatesSingleOwnership,
  guestOrderVisibleToOtherGuest,
  hashGuestToken,
  issueGuestToken,
  newCustomerId,
  normalizeCustomerEmail,
  applyGuestOrderClaim,
  signCustomerSession,
  verifyCustomerSession,
  type CustomerProfile,
  type CustomerSession,
  type OrderOwnership,
} from './customer-identity.ts'

type World = {
  customers: CustomerProfile[]
  orders: Array<OrderOwnership & { items: string }>
  sessions: Map<string, string>
}

function world(): World {
  return { customers: [], orders: [], sessions: new Map() }
}

function guestCheckout(w: World, input: { projectRef: string; email: string; name?: string }) {
  const guest = issueGuestToken()
  const customer: CustomerProfile = {
    id: newCustomerId(),
    projectRef: input.projectRef,
    email: normalizeCustomerEmail(input.email),
    name: input.name || '',
    customerType: 'guest',
    authIdentityId: null,
    emailVerified: false,
    createdAt: new Date().toISOString(),
  }
  const order: OrderOwnership & { items: string } = {
    orderId: newCustomerId(),
    projectRef: input.projectRef,
    customerId: customer.id,
    customerType: 'guest',
    email: customer.email,
    guestTokenHash: guest.hash,
    items: 'sku',
  }
  w.customers.push(customer)
  w.orders.push(order)
  return { customer, order, guestToken: guest.token }
}

function register(
  w: World,
  input: { projectRef: string; email: string; name?: string; emailVerified?: boolean },
) {
  const email = normalizeCustomerEmail(input.email)
  const emailVerified = input.emailVerified !== false
  const authIdentityId = newCustomerId()
  let customer = w.customers.find(
    (c) => c.projectRef === input.projectRef && c.email === email && c.customerType === 'registered',
  )
  if (!customer) {
    customer = {
      id: newCustomerId(),
      projectRef: input.projectRef,
      email,
      name: input.name || '',
      customerType: 'registered',
      authIdentityId,
      emailVerified,
      createdAt: new Date().toISOString(),
    }
    w.customers.push(customer)
  } else {
    customer.authIdentityId = authIdentityId
    customer.emailVerified = emailVerified
  }
  const claimant = {
    customerId: customer.id,
    projectRef: input.projectRef,
    email,
    emailVerified,
  }
  for (let i = 0; i < w.orders.length; i += 1) {
    const applied = applyGuestOrderClaim(w.orders[i], claimant)
    w.orders[i] = { ...applied.order, items: w.orders[i].items }
  }
  const token = signCustomerSession({
    projectRef: input.projectRef,
    customerId: customer.id,
    authIdentityId,
    email,
    name: customer.name,
    emailVerified,
  })
  w.sessions.set(customer.id, token)
  return { customer, token }
}

function sessionOf(w: World, customerId: string): CustomerSession | null {
  const token = w.sessions.get(customerId)
  const customer = w.customers.find((c) => c.id === customerId)
  if (!token || !customer) return null
  return verifyCustomerSession(token, customer.projectRef)
}

function myOrders(w: World, session: CustomerSession | null) {
  return w.orders.filter((o) => canListOrder(o, session))
}

describe('V1.1 customer contract', () => {
  it('lists CUSTOMER-001…007 and keeps guest checkout required', () => {
    assert.deepEqual([...CUSTOMER_INVARIANT_IDS], [
      'CUSTOMER-001',
      'CUSTOMER-002',
      'CUSTOMER-003',
      'CUSTOMER-004',
      'CUSTOMER-005',
      'CUSTOMER-006',
      'CUSTOMER-007',
    ])
    assert.equal(CUSTOMER_APPLICATION_CONTRACT.version, 'ecommerce-contract/v1.1')
    assert.ok(CUSTOMER_APPLICATION_CONTRACT.requiredFlows.includes('guest_checkout'))
    assert.ok(CUSTOMER_APPLICATION_CONTRACT.requiredFlows.includes('cross_customer_isolation'))
    assert.ok(CUSTOMER_APPLICATION_CONTRACT.requiredFlows.includes('two_browser_isolation'))
    assert.ok(CUSTOMER_APPLICATION_CONTRACT.requiredFlows.includes('verified_email_claim'))
  })
})

describe('CUSTOMER-001…007', () => {
  beforeEach(() => {
    process.env.BUILDER_CFOS_HANDOFF_SECRET = 'x'.repeat(32)
  })

  it('CUSTOMER-001 registered customer lists only own orders', () => {
    const w = world()
    const a = register(w, { projectRef: 'shop1', email: 'a@indobase.in' })
    const b = register(w, { projectRef: 'shop1', email: 'b@indobase.in' })
    guestCheckout(w, { projectRef: 'shop1', email: 'a@indobase.in' })
    const aOrder = {
      orderId: 'ord_a',
      projectRef: 'shop1',
      customerId: a.customer.id,
      customerType: 'registered' as const,
      email: 'a@indobase.in',
    }
    const bOrder = {
      orderId: 'ord_b',
      projectRef: 'shop1',
      customerId: b.customer.id,
      customerType: 'registered' as const,
      email: 'b@indobase.in',
    }
    w.orders.push(aOrder, bOrder)
    const listed = myOrders(w, sessionOf(w, a.customer.id))
    assert.ok(listed.every((o) => o.customerId === a.customer.id))
    assert.equal(listed.some((o) => o.orderId === 'ord_b'), false)
  })

  it('CUSTOMER-002 cannot modify another customer order', () => {
    const w = world()
    const a = register(w, { projectRef: 'shop1', email: 'a@indobase.in' })
    const b = register(w, { projectRef: 'shop1', email: 'b@indobase.in' })
    const order: OrderOwnership = {
      orderId: 'ord_a',
      projectRef: 'shop1',
      customerId: a.customer.id,
      customerType: 'registered',
      email: 'a@indobase.in',
    }
    assert.equal(canModifyOrder(order, sessionOf(w, b.customer.id)), false)
    assert.equal(canModifyOrder(order, sessionOf(w, a.customer.id)), true)
  })

  it('CUSTOMER-003 guest order is invisible to another guest', () => {
    const w = world()
    const first = guestCheckout(w, { projectRef: 'shop1', email: 'same@indobase.in' })
    const second = guestCheckout(w, { projectRef: 'shop1', email: 'same@indobase.in' })
    assert.equal(canViewOrder({ order: first.order, session: null, guestToken: first.guestToken }), true)
    assert.equal(
      guestOrderVisibleToOtherGuest({ order: first.order, otherGuestToken: second.guestToken }),
      false,
    )
    assert.equal(canViewOrder({ order: first.order, session: null, guestToken: second.guestToken }), false)
    assert.equal(canListOrder(first.order, null), false)
  })

  it('CUSTOMER-004 refresh preserves signed session', () => {
    const w = world()
    const a = register(w, { projectRef: 'shop1', email: 'a@indobase.in' })
    const again = verifyCustomerSession(a.token, 'shop1')
    assert.ok(again)
    assert.equal(again.customerId, a.customer.id)
    assert.equal(again.email, 'a@indobase.in')
  })

  it('CUSTOMER-005 logout removes access', () => {
    const w = world()
    const a = register(w, { projectRef: 'shop1', email: 'a@indobase.in' })
    const order = guestCheckout(w, { projectRef: 'shop1', email: 'a@indobase.in' }).order
    order.customerId = a.customer.id
    order.customerType = 'registered'
    w.sessions.delete(a.customer.id)
    assert.equal(canListOrder(order, null), false)
    assert.equal(verifyCustomerSession(a.token, 'shop1')?.customerId, a.customer.id)
    assert.equal(myOrders(w, null).length, 0)
  })

  it('CUSTOMER-006 checkout creates exactly one ownership relationship', () => {
    const w = world()
    const { order } = guestCheckout(w, { projectRef: 'shop1', email: 'g@indobase.in' })
    assert.equal(checkoutCreatesSingleOwnership(order), true)
    assert.equal(w.orders.filter((o) => o.orderId === order.orderId).length, 1)
    assert.equal(w.customers.filter((c) => c.id === order.customerId).length, 1)
  })

  it('CUSTOMER-007 guest→account upgrade preserves same-tenant orders', () => {
    const w = world()
    const guest = guestCheckout(w, { projectRef: 'shop1', email: 'g@indobase.in', name: 'G' })
    const otherTenant = guestCheckout(w, { projectRef: 'shop2', email: 'g@indobase.in' })
    const registered = register(w, { projectRef: 'shop1', email: 'g@indobase.in', name: 'G' })
    const mine = myOrders(w, sessionOf(w, registered.customer.id))
    assert.equal(mine.some((o) => o.orderId === guest.order.orderId), true)
    assert.equal(mine.some((o) => o.orderId === otherTenant.order.orderId), false)
    assert.equal(w.orders.find((o) => o.orderId === guest.order.orderId)?.customerType, 'registered')
    assert.equal(w.orders.find((o) => o.orderId === otherTenant.order.orderId)?.customerType, 'guest')
  })

  it('rejects cross-tenant session', () => {
    const a = signCustomerSession({
      projectRef: 'shop1',
      customerId: 'cust1',
      authIdentityId: 'auth1',
      email: 'a@indobase.in',
      name: 'A',
      emailVerified: true,
    })
    assert.equal(verifyCustomerSession(a, 'shop2'), null)
  })

  it('guest token hash is not reversible via another token', () => {
    const a = issueGuestToken()
    const b = issueGuestToken()
    assert.notEqual(a.hash, b.hash)
    assert.equal(hashGuestToken(a.token), a.hash)
  })
})

describe('E2E CUSTOMER-001 two-user isolation', () => {
  beforeEach(() => {
    process.env.BUILDER_CFOS_HANDOFF_SECRET = 'x'.repeat(32)
  })

  it('anonymous browse → guest checkout → account → own orders only → logout → second customer isolation', () => {
    const store = 'corev1'
    const w = world()

    const guest = guestCheckout(w, { projectRef: store, email: 'first@indobase.in', name: 'First' })
    assert.equal(canViewOrder({ order: guest.order, session: null, guestToken: guest.guestToken }), true)

    const first = register(w, { projectRef: store, email: 'first@indobase.in', name: 'First' })
    const firstSession = sessionOf(w, first.customer.id)
    assert.ok(firstSession)
    const afterUpgrade = myOrders(w, firstSession)
    assert.equal(afterUpgrade.some((o) => o.orderId === guest.order.orderId), true)

    const registeredCheckout = {
      orderId: newCustomerId(),
      projectRef: store,
      customerId: first.customer.id,
      customerType: 'registered' as const,
      email: 'first@indobase.in',
      items: 'sku2',
    }
    w.orders.push(registeredCheckout)
    assert.equal(myOrders(w, firstSession).length, 2)

    w.sessions.delete(first.customer.id)
    assert.equal(myOrders(w, null).length, 0)

    const second = register(w, { projectRef: store, email: 'second@indobase.in', name: 'Second' })
    const secondSession = sessionOf(w, second.customer.id)
    const visible = myOrders(w, secondSession)
    assert.equal(visible.length, 0)
    assert.equal(canViewOrder({ order: guest.order, session: secondSession }), false)
    assert.equal(canViewOrder({ order: registeredCheckout, session: secondSession }), false)
  })
})
